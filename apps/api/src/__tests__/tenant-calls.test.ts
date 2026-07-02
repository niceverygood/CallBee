/**
 * GET /tenants/:id/calls (+ /:callId) — 테넌트 통화 기록 열람(product-spec §4.9).
 * AuthGuard + assertTenantScope: 테넌트는 자기 통화만 열람(타 테넌트 403).
 */
import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import type { TenantId } from "@colli/contracts";
import type { TenantCallDetail } from "../tenant.ports.js";
import {
  makeTenantHarness,
  mockPlatformAdminReq,
  mockTenantAdminReq,
} from "./tenant-harness.js";

function callFixture(
  overrides: Partial<Omit<TenantCallDetail, "id">> = {},
): Omit<TenantCallDetail, "id"> {
  return {
    clawOpsCallId: "clawops_call_1",
    from: "+821012345678",
    to: "07011112222",
    direction: "inbound",
    intent: "reservation",
    emotion: "neutral",
    outcome: "kb_answered",
    subscriberId: null,
    subscriberName: null,
    startedAt: "2026-07-01T10:00:00.000Z",
    durationSec: 95,
    recordingUrl: null,
    summary: "예약 문의 응대",
    transcript: [
      { role: "agent", text: "안녕하세요, 테스트 식당 AI 상담원입니다.", atSec: 0 },
      { role: "caller", text: "오늘 저녁 4명 예약돼요? 제 번호는 010-****-5678 이에요.", atSec: 4 },
    ],
    toolInvocations: ["get_kb_answer"],
    ...overrides,
  };
}

async function makeTenant(h: ReturnType<typeof makeTenantHarness>, slug: string, phone: string) {
  const created = await h.controller.create({ slug, name: slug, phoneNumber: phone });
  if (!created.ok) throw new Error("setup failed");
  return created.data.tenantId;
}

describe("GET /tenants/:id/calls — 목록", () => {
  it("자기 테넌트 통화만 startedAt desc(최신순)로 반환한다", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const other = await makeTenant(h, "other-shop", "07033334444");

    h.callSessions.seed(mine, callFixture({ startedAt: "2026-07-01T09:00:00.000Z" }));
    h.callSessions.seed(mine, callFixture({ startedAt: "2026-07-01T11:00:00.000Z" }));
    h.callSessions.seed(other, callFixture({ startedAt: "2026-07-01T12:00:00.000Z" }));

    const res = await h.controller.listCalls(mockTenantAdminReq(mine), mine);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.length).toBe(2);
    expect(res.data[0]!.startedAt).toBe("2026-07-01T11:00:00.000Z");
    expect(res.data[1]!.startedAt).toBe("2026-07-01T09:00:00.000Z");
    // 목록 아이템에는 전사/녹음이 실리지 않는다(상세 전용)
    expect("transcript" in res.data[0]!).toBe(false);
  });

  it("limit/offset 페이지네이션 + limit 은 1~100 으로 클램프된다", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    for (let i = 0; i < 5; i++) {
      h.callSessions.seed(
        mine,
        callFixture({ startedAt: `2026-07-01T0${i}:00:00.000Z` }),
      );
    }

    const page = await h.controller.listCalls(mockTenantAdminReq(mine), mine, "2", "1");
    expect(page.ok).toBe(true);
    if (page.ok) {
      expect(page.data.length).toBe(2);
      expect(page.data[0]!.startedAt).toBe("2026-07-01T03:00:00.000Z");
    }

    // 비정상 limit(0/음수/문자)은 기본값으로 — 전체 5건 반환
    const clamped = await h.controller.listCalls(mockTenantAdminReq(mine), mine, "abc");
    expect(clamped.ok).toBe(true);
    if (clamped.ok) expect(clamped.data.length).toBe(5);
  });

  it("타 테넌트의 :id 로 접근하면 403(ForbiddenException)", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const other = await makeTenant(h, "other-shop", "07033334444");
    h.callSessions.seed(other, callFixture());

    await expect(
      h.controller.listCalls(mockTenantAdminReq(mine), other),
    ).rejects.toThrow(ForbiddenException);
  });

  it("platform_admin 은 모든 테넌트의 통화를 열람할 수 있다", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    h.callSessions.seed(mine, callFixture());

    const res = await h.controller.listCalls(mockPlatformAdminReq(), mine);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.length).toBe(1);
  });
});

describe("GET /tenants/:id/calls/:callId — 상세", () => {
  it("전사(마스킹 텍스트)+요약+tool trace 를 포함해 반환한다", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const seeded = h.callSessions.seed(mine, callFixture());

    const res = await h.controller.getCallDetail(
      mockTenantAdminReq(mine),
      mine,
      seeded.id,
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.summary).toBe("예약 문의 응대");
    expect(res.data.transcript.length).toBe(2);
    expect(res.data.transcript[1]!.text).toContain("010-****-5678"); // 마스킹된 텍스트 그대로
    expect(res.data.toolInvocations).toEqual(["get_kb_answer"]);
    expect(res.data.intent).toBe("reservation");
  });

  it("타 테넌트 소유 통화 id 는 call_not_found(존재 자체를 숨김)", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const other = await makeTenant(h, "other-shop", "07033334444");
    const othersCall = h.callSessions.seed(other, callFixture());

    // platform_admin 으로 접근해도(스코프 통과) 저장소 레벨에서 격리된다
    const res = await h.controller.getCallDetail(
      mockTenantAdminReq(mine),
      mine,
      othersCall.id,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("call_not_found");
  });

  it("타 테넌트의 :id 스코프로 상세 접근하면 403(ForbiddenException)", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const other = await makeTenant(h, "other-shop", "07033334444");
    const othersCall = h.callSessions.seed(other, callFixture());

    await expect(
      h.controller.getCallDetail(mockTenantAdminReq(mine), other, othersCall.id),
    ).rejects.toThrow(ForbiddenException);
  });

  it("없는 callId 는 call_not_found", async () => {
    const h = makeTenantHarness();
    const mine = await makeTenant(h, "my-shop", "07011112222");
    const res = await h.controller.getCallDetail(mockTenantAdminReq(mine), mine, "nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("call_not_found");
  });
});
