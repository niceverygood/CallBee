/**
 * POST /ingest/* — 음성 게이트웨이 통화 기록 쓰기 3종 + GatewayGuard.
 *
 * 핵심 검증:
 * - 세션 생성 멱등(clawopsCallId), toNumber → 테넌트 라우팅
 * - 전사 저장 전 maskPII 강제(GUARDRAIL #1)
 * - 마감 업데이트가 콘솔 통화 기록(GET /tenants/:id/calls — 같은 저장소)에 보임
 * - x-gateway-secret 불일치 401
 */
import { afterEach, describe, it, expect } from "vitest";
import { UnauthorizedException, type ExecutionContext } from "@nestjs/common";
import { IngestController } from "../ingest.controller.js";
import { GatewayGuard, DEV_GATEWAY_SECRET_FALLBACK } from "../gateway.guard.js";
import {
  makeTenantHarness,
  mockPlatformAdminReq,
} from "./tenant-harness.js";

function makeIngestHarness() {
  const h = makeTenantHarness();
  // 인메모리 CallSession 저장소는 read+ingest 를 한 인스턴스가 구현한다
  // (tenant.module.ts 의 useExisting 배선과 동일 — 같은 저장소 공유).
  const ingest = new IngestController(h.tenants, h.callSessions);
  return { ...h, ingest };
}

const CALL_BODY = {
  clawopsCallId: "clawops_live_1",
  toNumber: "07011112222",
  fromNumber: "+821012345678",
  startedAt: "2026-07-03T01:00:00.000Z",
};

async function seedActiveTenant(h: ReturnType<typeof makeTenantHarness>) {
  return h.tenants.create({
    slug: "my-shop",
    name: "마이샵",
    phoneNumber: "07011112222",
    status: "active",
  });
}

describe("POST /ingest/calls — 세션 생성(멱등)", () => {
  it("toNumber 로 테넌트를 찾아 세션을 만들고 callSessionId 를 반환한다", async () => {
    const h = makeIngestHarness();
    const tenant = await seedActiveTenant(h);

    const res = await h.ingest.createCall(CALL_BODY);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.callSessionId).toBeTruthy();

    // 같은 저장소를 콘솔 통화 기록 라우트가 그대로 읽는다
    const list = await h.controller.listCalls(mockPlatformAdminReq(), tenant.tenantId);
    expect(list.ok).toBe(true);
    if (list.ok) {
      expect(list.data.length).toBe(1);
      expect(list.data[0]!.clawOpsCallId).toBe("clawops_live_1");
      expect(list.data[0]!.from).toBe("+821012345678");
    }
  });

  it("동일 clawopsCallId 재요청이면 기존 세션을 반환한다(멱등 — 중복 생성 없음)", async () => {
    const h = makeIngestHarness();
    const tenant = await seedActiveTenant(h);

    const first = await h.ingest.createCall(CALL_BODY);
    const second = await h.ingest.createCall(CALL_BODY);
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.data.callSessionId).toBe(first.data.callSessionId);
    }
    const list = await h.controller.listCalls(mockPlatformAdminReq(), tenant.tenantId);
    if (list.ok) expect(list.data.length).toBe(1);
  });

  it("미등록 toNumber 는 tenant_not_found", async () => {
    const h = makeIngestHarness();
    const res = await h.ingest.createCall({ ...CALL_BODY, toNumber: "07099998888" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tenant_not_found");
  });

  it("필수 필드 누락/비정상 startedAt 은 invalid_params", async () => {
    const h = makeIngestHarness();
    await seedActiveTenant(h);
    const missing = await h.ingest.createCall({ ...CALL_BODY, clawopsCallId: "" });
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.error.code).toBe("invalid_params");

    const badDate = await h.ingest.createCall({ ...CALL_BODY, startedAt: "어제" });
    expect(badDate.ok).toBe(false);
    if (!badDate.ok) expect(badDate.error.code).toBe("invalid_params");
  });
});

describe("POST /ingest/calls/:id/transcripts — 전사 append(maskPII 강제)", () => {
  it("카드번호가 포함된 발화는 마스킹된 텍스트로만 저장된다(GUARDRAIL #1)", async () => {
    const h = makeIngestHarness();
    const tenant = await seedActiveTenant(h);
    const created = await h.ingest.createCall(CALL_BODY);
    if (!created.ok) throw new Error("setup failed");
    const callSessionId = created.data.callSessionId;

    const res = await h.ingest.appendTranscript(callSessionId, {
      role: "caller",
      text: "제 카드번호는 1234-5678-1234-5678 이에요.",
      startMs: 4200,
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.transcriptId).toBeTruthy();

    const detail = await h.controller.getCallDetail(
      mockPlatformAdminReq(),
      tenant.tenantId,
      callSessionId,
    );
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.transcript.length).toBe(1);
    expect(detail.data.transcript[0]!.text).toContain("[CARD]");
    expect(detail.data.transcript[0]!.text).not.toContain("1234-5678-1234-5678");
    expect(detail.data.transcript[0]!.role).toBe("caller");
    expect(detail.data.transcript[0]!.atSec).toBe(4); // startMs 4200 → 4초
  });

  it("role 은 caller|agent 만 허용(그 외 invalid_params), 없는 세션은 call_not_found", async () => {
    const h = makeIngestHarness();
    await seedActiveTenant(h);
    const created = await h.ingest.createCall(CALL_BODY);
    if (!created.ok) throw new Error("setup failed");

    const badRole = await h.ingest.appendTranscript(created.data.callSessionId, {
      role: "system",
      text: "안녕하세요",
    });
    expect(badRole.ok).toBe(false);
    if (!badRole.ok) expect(badRole.error.code).toBe("invalid_params");

    const notFound = await h.ingest.appendTranscript("nope", {
      role: "agent",
      text: "안녕하세요",
    });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.error.code).toBe("call_not_found");
  });
});

describe("POST /ingest/calls/:id/complete — 세션 마감", () => {
  it("durationSec/outcome/summary/recordingUrl 이 콘솔 상세에 반영된다", async () => {
    const h = makeIngestHarness();
    const tenant = await seedActiveTenant(h);
    const created = await h.ingest.createCall(CALL_BODY);
    if (!created.ok) throw new Error("setup failed");
    const callSessionId = created.data.callSessionId;

    const res = await h.ingest.completeCall(callSessionId, {
      endedAt: "2026-07-03T01:02:35.000Z",
      durationSec: 155,
      outcome: "callback_queued",
      summary: "예약 문의 → 콜백 접수",
      recordingUrl: "https://recordings.example.com/1.mp3",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.completed).toBe(true);

    const detail = await h.controller.getCallDetail(
      mockPlatformAdminReq(),
      tenant.tenantId,
      callSessionId,
    );
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.data.durationSec).toBe(155);
    expect(detail.data.outcome).toBe("callback_queued");
    expect(detail.data.summary).toBe("예약 문의 → 콜백 접수");
    expect(detail.data.recordingUrl).toBe("https://recordings.example.com/1.mp3");
  });

  it("없는 세션은 call_not_found, 비정상 outcome/durationSec 은 invalid_params", async () => {
    const h = makeIngestHarness();
    await seedActiveTenant(h);
    const created = await h.ingest.createCall(CALL_BODY);
    if (!created.ok) throw new Error("setup failed");

    const notFound = await h.ingest.completeCall("nope", {
      endedAt: "2026-07-03T01:02:35.000Z",
      durationSec: 10,
    });
    expect(notFound.ok).toBe(false);
    if (!notFound.ok) expect(notFound.error.code).toBe("call_not_found");

    const badOutcome = await h.ingest.completeCall(created.data.callSessionId, {
      endedAt: "2026-07-03T01:02:35.000Z",
      durationSec: 10,
      outcome: "party_time",
    });
    expect(badOutcome.ok).toBe(false);
    if (!badOutcome.ok) expect(badOutcome.error.code).toBe("invalid_params");

    const badDuration = await h.ingest.completeCall(created.data.callSessionId, {
      endedAt: "2026-07-03T01:02:35.000Z",
      durationSec: -5,
    });
    expect(badDuration.ok).toBe(false);
    if (!badDuration.ok) expect(badDuration.error.code).toBe("invalid_params");
  });
});

describe("GatewayGuard — x-gateway-secret 고정 시크릿 인증", () => {
  function mockContext(headers: Record<string, string>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => ({ headers }) }),
    } as unknown as ExecutionContext;
  }

  afterEach(() => {
    delete process.env.GATEWAY_SHARED_SECRET;
  });

  it("환경변수 미설정 시 개발용 fallback 시크릿과 일치하면 통과", () => {
    delete process.env.GATEWAY_SHARED_SECRET;
    const guard = new GatewayGuard();
    expect(
      guard.canActivate(mockContext({ "x-gateway-secret": DEV_GATEWAY_SECRET_FALLBACK })),
    ).toBe(true);
  });

  it("GATEWAY_SHARED_SECRET 설정 시 그 값과 일치해야 통과, 불일치/누락은 401", () => {
    process.env.GATEWAY_SHARED_SECRET = "prod-secret-123";
    const guard = new GatewayGuard();
    expect(guard.canActivate(mockContext({ "x-gateway-secret": "prod-secret-123" }))).toBe(
      true,
    );
    expect(() =>
      guard.canActivate(mockContext({ "x-gateway-secret": DEV_GATEWAY_SECRET_FALLBACK })),
    ).toThrow(UnauthorizedException);
    expect(() => guard.canActivate(mockContext({}))).toThrow(UnauthorizedException);
  });
});
