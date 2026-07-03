/**
 * IngestController — 음성 게이트웨이(ClawOps 인바운드 프로세스) 전용 통화 기록
 * 쓰기 라우트 3종. 콘솔 통화 기록 화면(GET /tenants/:id/calls)이 읽는 것과
 * 같은 저장소(CallSession/Transcript)에 기록한다.
 *
 *   POST /ingest/calls                              세션 생성(clawopsCallId 멱등)
 *   POST /ingest/calls/:callSessionId/transcripts   전사 append(저장 전 maskPII)
 *   POST /ingest/calls/:callSessionId/complete      세션 마감
 *
 * 인증: GatewayGuard — `x-gateway-secret` 고정 시크릿 헤더(불일치 401).
 * 응답 봉투: 항상 { ok:true, data } | { ok:false, error } (HTTP 200).
 *
 * GUARDRAIL #1/#7: 전사 텍스트는 저장 전 반드시 @colli/compliance 의 maskPII 를
 * 통과한다(카드/계좌/CVC 마스킹) — 게이트웨이가 마스킹을 잊어도 여기서 강제.
 */
import {
  Body,
  Controller,
  HttpCode,
  Inject,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import {
  CALL_OUTCOMES,
  type CallOutcome,
  type SpeakerRole,
  type TenantId,
} from "@colli/contracts";
import { maskPII } from "@colli/compliance";
import type {
  TenantRepository,
  CallSessionIngestRepository,
} from "./tenant.ports.js";
import { TENANT_REPO, CALL_SESSION_INGEST_REPO } from "./tokens.js";
import { GatewayGuard } from "./gateway.guard.js";
import { WebhookValidationError } from "./webhook-validation.js";
import type { ApiResult } from "./tenants.controller.js";

/** 게이트웨이가 전사 role 로 보낼 수 있는 값(SPEAKER_ROLES 중 통화 발화 2종). */
const INGEST_TRANSCRIPT_ROLES = ["caller", "agent"] as const;
type IngestTranscriptRole = (typeof INGEST_TRANSCRIPT_ROLES)[number];

function errResult(err: unknown): ApiResult<never> {
  if (err instanceof WebhookValidationError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { ok: false, error: { code: "internal_error", message } };
}

/** ISO8601(Date 로 파싱 가능) 검증. 실패 시 invalid_params. */
function assertIsoDate(value: unknown, field: string): string {
  if (typeof value !== "string" || Number.isNaN(new Date(value).getTime())) {
    throw new WebhookValidationError(
      "invalid_params",
      `${field} must be an ISO8601 datetime string`,
    );
  }
  return value;
}

function assertNonEmptyString(value: unknown, field: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new WebhookValidationError("invalid_params", `${field} is required`);
  }
  return value;
}

@Controller("ingest")
@UseGuards(GatewayGuard)
export class IngestController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(CALL_SESSION_INGEST_REPO)
    private readonly callSessions: CallSessionIngestRepository,
  ) {}

  // ── 세션 생성(멱등) ───────────────────────────────────────────
  @Post("calls")
  @HttpCode(200)
  async createCall(
    @Body()
    body: {
      clawopsCallId?: string;
      toNumber?: string;
      fromNumber?: string;
      startedAt?: string;
    },
  ): Promise<ApiResult<{ callSessionId: string }>> {
    try {
      const clawopsCallId = assertNonEmptyString(body?.clawopsCallId, "clawopsCallId");
      const toNumber = assertNonEmptyString(body?.toNumber, "toNumber");
      const fromNumber = assertNonEmptyString(body?.fromNumber, "fromNumber");
      const startedAt = assertIsoDate(body?.startedAt, "startedAt");

      // 멱등: 동일 clawopsCallId 재요청이면 기존 세션 반환(재시도/중복 웹훅 안전).
      const existing = await this.callSessions.findByClawopsCallId(clawopsCallId);
      if (existing) {
        return { ok: true, data: { callSessionId: existing.callSessionId } };
      }

      const tenant = await this.tenants.findByPhoneNumber(toNumber);
      if (!tenant) {
        return {
          ok: false,
          error: { code: "tenant_not_found", message: `no tenant for ${toNumber}` },
        };
      }

      const created = await this.callSessions.create(tenant.tenantId as TenantId, {
        clawopsCallId,
        toNumber,
        fromNumber,
        startedAt,
      });
      return { ok: true, data: { callSessionId: created.callSessionId } };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 전사 append (저장 전 PII 마스킹 강제) ─────────────────────
  @Post("calls/:callSessionId/transcripts")
  @HttpCode(200)
  async appendTranscript(
    @Param("callSessionId") callSessionId: string,
    @Body() body: { role?: string; text?: string; startMs?: number },
  ): Promise<ApiResult<{ transcriptId: string }>> {
    try {
      const role = body?.role;
      if (!INGEST_TRANSCRIPT_ROLES.includes(role as IngestTranscriptRole)) {
        throw new WebhookValidationError(
          "invalid_params",
          `role must be one of: ${INGEST_TRANSCRIPT_ROLES.join(", ")}`,
        );
      }
      const text = assertNonEmptyString(body?.text, "text");
      const startMs = body?.startMs;
      if (startMs !== undefined && (!Number.isFinite(startMs) || startMs < 0)) {
        throw new WebhookValidationError(
          "invalid_params",
          "startMs must be a non-negative number",
        );
      }

      // GUARDRAIL #1: 카드/계좌/CVC 는 마스킹된 형태로만 저장한다.
      const { masked } = maskPII(text);

      const appended = await this.callSessions.appendTranscript(callSessionId, {
        role: role as SpeakerRole,
        text: masked,
        startMs: startMs ?? null,
      });
      if (!appended) {
        return {
          ok: false,
          error: { code: "call_not_found", message: `no call session: ${callSessionId}` },
        };
      }
      return { ok: true, data: { transcriptId: appended.transcriptId } };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 세션 마감 ─────────────────────────────────────────────────
  @Post("calls/:callSessionId/complete")
  @HttpCode(200)
  async completeCall(
    @Param("callSessionId") callSessionId: string,
    @Body()
    body: {
      endedAt?: string;
      durationSec?: number;
      outcome?: string | null;
      summary?: string | null;
      recordingUrl?: string | null;
    },
  ): Promise<ApiResult<{ callSessionId: string; completed: true }>> {
    try {
      const endedAt = assertIsoDate(body?.endedAt, "endedAt");
      const durationSec = body?.durationSec;
      if (!Number.isFinite(durationSec) || (durationSec as number) < 0) {
        throw new WebhookValidationError(
          "invalid_params",
          "durationSec must be a non-negative number",
        );
      }
      const outcome = body?.outcome;
      if (
        outcome !== undefined &&
        outcome !== null &&
        !CALL_OUTCOMES.includes(outcome as CallOutcome)
      ) {
        throw new WebhookValidationError(
          "invalid_params",
          `outcome must be one of: ${CALL_OUTCOMES.join(", ")}`,
        );
      }

      const completed = await this.callSessions.complete(callSessionId, {
        endedAt,
        durationSec: Math.trunc(durationSec as number),
        ...(outcome !== undefined && { outcome: outcome as CallOutcome | null }),
        ...(body?.summary !== undefined && { summary: body.summary }),
        ...(body?.recordingUrl !== undefined && { recordingUrl: body.recordingUrl }),
      });
      if (!completed) {
        return {
          ok: false,
          error: { code: "call_not_found", message: `no call session: ${callSessionId}` },
        };
      }
      return { ok: true, data: { callSessionId, completed: true } };
    } catch (err) {
      return errResult(err);
    }
  }
}
