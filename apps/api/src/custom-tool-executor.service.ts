/**
 * CustomToolExecutor — 테넌트 커스텀 tool(webhook 기반) 실행기.
 *
 * docs/tenant-platform-architecture.md §5.2 시퀀스:
 * 1) TenantTool 조회(tenantId+name), enabled 아니면 즉시 실패.
 * 2) paramsSchema 로 런타임 검증(실패 시 invalid_params).
 * 3) body = { tool: name, callSessionId, tenantId, params }.
 * 4) webhookSecret 있으면 HMAC-SHA256 서명 헤더(X-Colli-Signature) 첨부.
 * 5) POST webhookUrl, timeoutMs(기본 8000) 내 응답 대기.
 * 6) 응답 { ok, data|error } 정규화.
 * 7) ToolInvocation trace 기록(toolName='custom:{name}', tenantId 포함).
 *
 * 실HTTP 호출은 WebhookToolInvoker 포트에 위임(이 클래스는 그 포트만 신뢰).
 * 기존 ToolsService(8개 시스템 tool 구현)는 이 파일에서 전혀 건드리지 않는다.
 */
import { createHmac } from "node:crypto";
import type { TenantId, CallSessionId } from "@colli/contracts";
import type { CustomToolRepository, WebhookToolInvoker } from "./tenant.ports.js";
import type { TracePort } from "./ports.js";
import { validateParamsAgainstSchema, WebhookValidationError } from "./webhook-validation.js";

export interface CustomToolExecutorDeps {
  customTools: CustomToolRepository;
  webhookInvoker: WebhookToolInvoker;
  trace: TracePort;
}

export interface CustomToolInvokeContext {
  tenantId: TenantId;
  callSessionId?: CallSessionId;
}

/** 커스텀 tool 실행 결과 봉투(ToolInvocationResult 와 동일 shape, tool 이름은 런타임 문자열). */
export type CustomToolInvocationResult =
  | { ok: true; tool: string; data: unknown }
  | { ok: false; tool: string; error: { code: string; message: string } };

export class CustomToolExecutor {
  constructor(private readonly deps: CustomToolExecutorDeps) {}

  async invoke(
    name: string,
    params: unknown,
    ctx: CustomToolInvokeContext,
  ): Promise<CustomToolInvocationResult> {
    const started = Date.now();
    const traceName = `custom:${name}`;
    try {
      // 1) 조회 + enabled 확인
      const tool = await this.deps.customTools.findByName(ctx.tenantId, name);
      if (!tool || !tool.enabled) {
        throw new WebhookValidationError(
          "tool_not_found",
          `custom tool not found or disabled: ${name}`,
        );
      }

      // 2) 런타임 파라미터 검증
      validateParamsAgainstSchema(tool.paramsSchema, params ?? {});

      // 3) body 조립 + 4) HMAC 서명
      const secret = await this.deps.customTools.getWebhookSecret(
        ctx.tenantId,
        tool.toolId,
      );
      const bodyForSignature = JSON.stringify({
        tool: name,
        callSessionId: ctx.callSessionId ?? null,
        tenantId: ctx.tenantId,
        params: params ?? {},
      });
      const signature = secret ? signHmacSha256(secret, bodyForSignature) : null;

      // 5) webhook 호출(타임아웃/실패는 WebhookToolInvoker 가 정규화해 반환)
      const response = await this.deps.webhookInvoker.invoke({
        tenantId: ctx.tenantId,
        toolName: name,
        webhookUrl: tool.webhookUrl,
        webhookSecret: signature,
        timeoutMs: tool.timeoutMs,
        callSessionId: ctx.callSessionId ?? null,
        params: (params ?? {}) as Record<string, unknown>,
      });

      // 6) 응답 정규화
      const normalized = normalizeWebhookResponse(response);

      await this.deps.trace.record({
        callSessionId: ctx.callSessionId ?? null,
        toolName: traceName,
        paramsSummary: { tenantId: ctx.tenantId },
        ok: normalized.ok,
        errorCode: normalized.ok ? null : normalized.error.code,
        latencyMs: Date.now() - started,
      });

      if (normalized.ok) {
        return { ok: true, tool: name, data: normalized.data };
      }
      return { ok: false, tool: name, error: normalized.error };
    } catch (err) {
      const code =
        err instanceof WebhookValidationError ? err.code : "internal_error";
      const message = err instanceof Error ? err.message : "unknown error";
      await this.deps.trace.record({
        callSessionId: ctx.callSessionId ?? null,
        toolName: traceName,
        paramsSummary: { tenantId: ctx.tenantId },
        ok: false,
        errorCode: code,
        latencyMs: Date.now() - started,
      });
      return { ok: false, tool: name, error: { code, message } };
    }
  }
}

function signHmacSha256(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("hex");
}

/** webhook 응답이 { ok:true, data } | { ok:false, error:{code,message} } shape 가 아니면 정규화. */
function normalizeWebhookResponse(
  response: unknown,
): { ok: true; data: unknown } | { ok: false; error: { code: string; message: string } } {
  if (
    typeof response === "object" &&
    response !== null &&
    "ok" in response &&
    typeof (response as { ok: unknown }).ok === "boolean"
  ) {
    const r = response as { ok: boolean; data?: unknown; error?: { code?: unknown; message?: unknown } };
    if (r.ok) {
      return { ok: true, data: r.data };
    }
    if (
      r.error &&
      typeof r.error.code === "string" &&
      typeof r.error.message === "string"
    ) {
      return { ok: false, error: { code: r.error.code, message: r.error.message } };
    }
  }
  return {
    ok: false,
    error: { code: "malformed_webhook_response", message: "webhook response did not match expected shape" },
  };
}
