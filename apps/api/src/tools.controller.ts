/**
 * 얇은 NestJS 컨트롤러: POST /tools/:name.
 * ToolsService(순수 클래스)를 감싸고, 응답을 ToolInvocationResult 봉투로 반환한다.
 * 실제 로직은 전부 ToolsService 에 있다(계약 시그니처의 단일 소스).
 *
 * v2(멀티테넌트) 확장: name ∈ SYSTEM_TOOL_NAMES 면 기존 ToolsService.invoke
 * (변경 없음), 그 외는 CustomToolExecutor.invoke 로 위임한다(테넌트 webhook
 * tool). apps/voice 워커는 통화 세션 식별자(x-call-session-id, 기존과 동일)에
 * 더해 테넌트 식별자(x-tenant-id)를 헤더로 전달해야 한다 — 커스텀 tool 실행은
 * tenantId 스코프가 필수이기 때문. 시스템 tool 호출 시 x-tenant-id 는 아직
 * ToolsService 내부 쿼리에서 사용하지 않는다(변경 없음 원칙 유지).
 */
import { Body, Controller, Headers, Param, Post } from "@nestjs/common";
import {
  TOOL_NAMES,
  type TenantId,
  type ToolName,
  type ToolIO,
  type ToolInvocationResult,
  type CallSessionId,
} from "@colli/contracts";
import { ToolsService, ToolError } from "./tools.service.js";
import {
  CustomToolExecutor,
  type CustomToolInvocationResult,
} from "./custom-tool-executor.service.js";

@Controller("tools")
export class ToolsController {
  constructor(
    private readonly tools: ToolsService,
    // 기존 tools.controller.test.ts(4개)가 단일 인자로 직접 인스턴스화하므로
    // 하위호환을 위해 optional 로 둔다. 실제 통합 배선(ToolsModule)에서는
    // 항상 CustomToolExecutor 를 DI 주입한다.
    private readonly customTools?: CustomToolExecutor,
  ) {}

  @Post(":name")
  async invoke(
    @Param("name") name: string,
    @Body() body: unknown,
    // Worker A 가 통화 세션 식별자를 헤더로 전달(관측성·세션 상태 연결).
    @Headers("x-call-session-id") callSessionId?: string,
    // 커스텀 tool 실행에 필요한 테넌트 식별자(v2 신규 헤더).
    @Headers("x-tenant-id") tenantId?: string,
  ): Promise<ToolInvocationResult | CustomToolInvocationResult> {
    if (isToolName(name)) {
      try {
        const data = await this.tools.invoke(
          name,
          body as ToolIO[typeof name]["params"],
          { callSessionId: (callSessionId as CallSessionId) || undefined },
        );
        return { ok: true, tool: name, data } as ToolInvocationResult;
      } catch (err) {
        const code = err instanceof ToolError ? err.code : "internal_error";
        const message = err instanceof Error ? err.message : "unknown error";
        return { ok: false, tool: name, error: { code, message } };
      }
    }

    // name ∉ SYSTEM_TOOL_NAMES → 테넌트 커스텀 tool(webhook) 실행.
    if (!this.customTools) {
      return {
        ok: false,
        tool: name,
        error: { code: "unknown_tool", message: `unknown tool: ${name}` },
      };
    }
    if (!tenantId) {
      return {
        ok: false,
        tool: name,
        error: {
          code: "missing_tenant_id",
          message: "x-tenant-id header is required for custom tool invocation",
        },
      };
    }
    return this.customTools.invoke(name, body, {
      tenantId: tenantId as TenantId,
      callSessionId: (callSessionId as CallSessionId) || undefined,
    });
  }
}

function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}
