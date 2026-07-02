/**
 * 승인/반려(platform_admin 전용) — product-spec §3.2/§3.3.
 * POST /admin/tenants/:id/approve · /reject + GET /admin/tenants?status= 필터.
 * (role 강제 자체는 AuthGuard(@RequireRole) 책임 — 여기서는 상태기계/에러 코드를 검증.)
 */
import { describe, it, expect } from "vitest";
import type { TenantId } from "@colli/contracts";
import { makeAuthHarness, validSignupRequest } from "./auth-harness.js";

async function signupPendingTenant(
  h: ReturnType<typeof makeAuthHarness>,
  overrides: Partial<ReturnType<typeof validSignupRequest>> = {},
): Promise<TenantId> {
  const res = await h.signupController.signup({ ...validSignupRequest(), ...overrides });
  if (!res.ok) throw new Error(`signup setup failed: ${res.error.code}`);
  return res.data.tenantId;
}

describe("POST /admin/tenants/:id/approve — 승인(070 배정)", () => {
  it("pending_approval → active + phoneNumber 배정 + approvedAt 기록", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);

    const res = await h.authController.approveTenant(tenantId, {
      phoneNumber: "070-1234-5678",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.tenant.status).toBe("active");
    expect(res.data.tenant.phoneNumber).toBe("070-1234-5678");
    expect(res.data.tenant.approvedAt).toBeTruthy();
  });

  it("승인 후에는 GET /tenants/resolve 로 매칭된다(signup→approve→resolve 재현)", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    await h.authController.approveTenant(tenantId, { phoneNumber: "07012345678" });

    const ctx = await h.resolver.resolveByPhoneNumber("07012345678");
    expect(ctx).not.toBeNull();
    expect(ctx?.tenant.tenantId).toBe(tenantId);
    expect(ctx?.tenant.status).toBe("active");
    // 가입 시 자동 생성된 기본 에이전트 설정이 실려 나간다
    expect(ctx?.agentConfig.agentName).toBe("상담원");
  });

  it("pending_approval 이 아니면 invalid_state", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    await h.authController.approveTenant(tenantId, { phoneNumber: "07012345678" });

    // 이미 active — 재승인 시도
    const again = await h.authController.approveTenant(tenantId, {
      phoneNumber: "07087654321",
    });
    expect(again.ok).toBe(false);
    if (!again.ok) expect(again.error.code).toBe("invalid_state");
  });

  it("다른 사업장에 이미 배정된 070 번호면 phone_number_taken", async () => {
    const h = makeAuthHarness();
    const firstId = await signupPendingTenant(h);
    await h.authController.approveTenant(firstId, { phoneNumber: "07011112222" });

    const secondId = await signupPendingTenant(h, {
      email: "second@shop.example.com",
      businessName: "두 번째 가게",
    });
    const res = await h.authController.approveTenant(secondId, {
      phoneNumber: "07011112222", // 이미 첫 번째 사업장에 배정된 번호
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("phone_number_taken");
  });

  it("번호 형식 오류(숫자/하이픈 9~13자리 위반)는 invalid_params", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    const res = await h.authController.approveTenant(tenantId, {
      phoneNumber: "070-999",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("없는 테넌트는 tenant_not_found", async () => {
    const h = makeAuthHarness();
    const res = await h.authController.approveTenant("nope", {
      phoneNumber: "07012345678",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tenant_not_found");
  });
});

describe("POST /admin/tenants/:id/reject — 반려(사유 필수)", () => {
  it("pending_approval → rejected + rejectionReason/rejectedAt 기록", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);

    const reason = "사업장 연락처로 확인이 어려워 승인하지 못했어요. 문의 주시면 다시 도와드릴게요.";
    const res = await h.authController.rejectTenant(tenantId, { reason });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.tenant.status).toBe("rejected");
    expect(res.data.tenant.rejectionReason).toBe(reason);
    expect(res.data.tenant.rejectedAt).toBeTruthy();
  });

  it("reason 빈 값/공백만은 invalid_params", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    const res = await h.authController.rejectTenant(tenantId, { reason: "   " });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("reason 500자 초과는 invalid_params", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    const res = await h.authController.rejectTenant(tenantId, {
      reason: "가".repeat(501),
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("pending_approval 이 아니면 invalid_state", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    await h.authController.approveTenant(tenantId, { phoneNumber: "07012345678" });

    const res = await h.authController.rejectTenant(tenantId, { reason: "이미 승인됨" });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_state");
  });
});

describe("GET /admin/tenants — 상태 필터", () => {
  it("?status=pending_approval 은 대기 테넌트만, appliedAt 오름차순(오래된 신청 먼저)", async () => {
    const h = makeAuthHarness();
    const a = await signupPendingTenant(h, {
      email: "a@x.example.com",
      businessName: "가게 A",
    });
    const b = await signupPendingTenant(h, {
      email: "b@x.example.com",
      businessName: "가게 B",
    });
    // a 를 먼저 신청한 것으로 정렬 기준을 명시적으로 고정
    await h.tenants.update(a, { appliedAt: "2026-07-01T00:00:00.000Z" });
    await h.tenants.update(b, { appliedAt: "2026-07-02T00:00:00.000Z" });
    // active 테넌트 1개 추가(필터에서 제외되어야 함)
    const c = await signupPendingTenant(h, {
      email: "c@x.example.com",
      businessName: "가게 C",
    });
    await h.authController.approveTenant(c, { phoneNumber: "07099998888" });

    const res = await h.authController.listTenants("pending_approval");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.map((t) => t.tenantId)).toEqual([a, b]);
    expect(res.data.every((t) => t.status === "pending_approval")).toBe(true);
  });

  it("필터 없으면 전체, 잘못된 status 값은 invalid_params", async () => {
    const h = makeAuthHarness();
    await signupPendingTenant(h);

    const all = await h.authController.listTenants(undefined);
    expect(all.ok).toBe(true);
    if (all.ok) expect(all.data.length).toBe(1);

    const bad = await h.authController.listTenants("weird_status");
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("invalid_params");
  });

  it("목록 응답에 v3 신청 메타(industryKey/contactPhone/appliedAt)가 포함된다", async () => {
    const h = makeAuthHarness();
    await signupPendingTenant(h);
    const res = await h.authController.listTenants("pending_approval");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const t = res.data[0]!;
    expect(t.industryKey).toBe("restaurant_cafe");
    expect(t.contactPhone).toBe("010-1234-5678");
    expect(t.appliedAt).toBeTruthy();
  });
});

// ── 승인 시 업종 팩 자동 적용(v0.6.0) ────────────────────────────
describe("POST /admin/tenants/:id/approve — 업종 팩 자동 적용", () => {
  it("가입 업종에 팩이 있으면 승인 직후 자동 적용된다(의도/KB/설정 + 응답 요약)", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h); // industryKey=restaurant_cafe

    const res = await h.authController.approveTenant(tenantId, {
      phoneNumber: "07012349999",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.industryTemplate?.packTitle).toBe("식당·카페 팩");
    expect(res.data.industryTemplate?.createdIntentKeys).toContain("table_reservation");
    expect(res.data.industryTemplateError).toBeUndefined();

    // 저장 상태: 의도 생성 + 예시 KB 는 비활성
    const intents = await h.intents.list(tenantId);
    expect(intents.length).toBeGreaterThanOrEqual(5);
    const kb = await h.knowledge.list();
    expect(kb.some((k) => !k.enabled)).toBe(true);

    // 통화 컨텍스트(resolve)에도 즉시 실린다 — 사장님이 콘솔을 열기 전 상태
    const ctx = await h.resolver.resolveByPhoneNumber("07012349999");
    expect(ctx?.intents.map((i) => String(i.key))).toContain("hours_holiday");
    // 조사 자동 선택: "김윤정 파스타" 는 받침 없음 → "는"
    expect(ctx?.agentConfig.personaInstructions).toContain("김윤정 파스타는 식당·카페입니다");
  });

  it("팩이 없는 업종(other)은 industryTemplate=null 로 승인만 성공한다", async () => {
    const h = makeAuthHarness();
    const signup = await h.signupController.signup({
      ...validSignupRequest(),
      email: "etc@biz.example.com",
      businessName: "동네 세차장",
      industryKey: "other",
      industryCustomLabel: "세차장",
    });
    expect(signup.ok).toBe(true);
    if (!signup.ok) return;

    const res = await h.authController.approveTenant(signup.data.tenantId, {
      phoneNumber: "07055556666",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.tenant.status).toBe("active");
    expect(res.data.industryTemplate).toBeNull();
    expect(res.data.industryTemplateError).toBeUndefined();

    const intents = await h.intents.list(signup.data.tenantId);
    expect(intents).toHaveLength(0);
  });

  it("자동 적용은 비파괴 — 승인 전 이미 만든 같은 key 의도는 유지된다", async () => {
    const h = makeAuthHarness();
    const tenantId = await signupPendingTenant(h);
    await h.intents.create(tenantId, {
      key: "table_reservation",
      label: "사장님이 직접 만든 예약",
      keywords: ["예약"],
      sortOrder: 1,
    });

    const res = await h.authController.approveTenant(tenantId, {
      phoneNumber: "07012340000",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.industryTemplate?.skippedIntentKeys).toContain("table_reservation");

    const kept = await h.intents.findByKey(tenantId, "table_reservation");
    expect(kept?.label).toBe("사장님이 직접 만든 예약");
  });
});
