/**
 * POST /signup (공개, 무인증) — product-spec §2 가입 위저드 제출.
 * 검증 매트릭스 + 트랜잭션 생성물(테넌트/에이전트설정/계정) + 자동 로그인 토큰.
 */
import { describe, it, expect } from "vitest";
import { isPhoneNumberAssigned, PENDING_PHONE_PREFIX } from "@colli/contracts";
import { verifyToken } from "../auth/token.js";
import { makeAuthHarness, validSignupRequest } from "./auth-harness.js";

describe("POST /signup — 성공 경로", () => {
  it("계정+테넌트(pending_approval)+기본 에이전트 설정이 함께 생성되고 토큰이 발급된다", async () => {
    const h = makeAuthHarness();
    const res = await h.signupController.signup(validSignupRequest());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // SignupResult shape
    expect(res.data.tenantStatus).toBe("pending_approval");
    expect(res.data.account.role).toBe("tenant_admin");
    expect(res.data.account.tenantId).toBe(res.data.tenantId);
    expect(res.data.account.email).toBe("owner@pasta.example.com");

    // 자동 로그인 토큰: verifyToken 으로 검증 가능해야 한다
    const payload = verifyToken(res.data.token);
    expect(payload).not.toBeNull();
    expect(payload?.role).toBe("tenant_admin");
    expect(payload?.tenantId).toBe(res.data.tenantId);

    // 테넌트: 승인 대기 + 070 미배정 플레이스홀더(pending-{slug}) + 신청 메타
    const tenant = await h.tenants.findById(res.data.tenantId);
    expect(tenant?.status).toBe("pending_approval");
    expect(tenant?.phoneNumber.startsWith(PENDING_PHONE_PREFIX)).toBe(true);
    expect(isPhoneNumberAssigned(tenant!.phoneNumber)).toBe(false);
    expect(tenant?.industryKey).toBe("restaurant_cafe");
    expect(tenant?.industryLabel).toBe("식당·카페");
    expect(tenant?.contactPhone).toBe("010-1234-5678");
    expect(tenant?.plan).toBe("trial");
    expect(tenant?.appliedAt).toBeTruthy();

    // 기본 에이전트 설정(onboarding.controller 와 동일 값)
    const config = await h.agentConfigs.get(res.data.tenantId);
    expect(config?.serviceName).toBe("김윤정 파스타");
    expect(config?.agentName).toBe("상담원");
    expect(config?.intentUnresolvedFallbackTool).toBe("request_callback");
  });

  it("email 은 소문자로 정규화되어 저장된다", async () => {
    const h = makeAuthHarness();
    const res = await h.signupController.signup({
      ...validSignupRequest(),
      email: "Owner@Pasta.Example.COM",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.account.email).toBe("owner@pasta.example.com");
  });

  it("업종 '기타(other)' 는 industryCustomLabel 이 industryLabel 로 저장된다", async () => {
    const h = makeAuthHarness();
    const res = await h.signupController.signup({
      ...validSignupRequest(),
      industryKey: "other",
      industryCustomLabel: "반려동물 미용",
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const tenant = await h.tenants.findById(res.data.tenantId);
    expect(tenant?.industryKey).toBe("other");
    expect(tenant?.industryLabel).toBe("반려동물 미용");
  });

  it("가입 직후에는 GET /tenants/resolve 로 매칭되지 않는다(status 가드 + 플레이스홀더)", async () => {
    const h = makeAuthHarness();
    const res = await h.signupController.signup(validSignupRequest());
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const tenant = await h.tenants.findById(res.data.tenantId);
    const ctx = await h.resolver.resolveByPhoneNumber(tenant!.phoneNumber);
    expect(ctx).toBeNull();
  });
});

describe("POST /signup — 이메일 중복", () => {
  it("이미 가입된 이메일이면 email_already_exists (대소문자 무관)", async () => {
    const h = makeAuthHarness();
    const first = await h.signupController.signup(validSignupRequest());
    expect(first.ok).toBe(true);

    const dup = await h.signupController.signup({
      ...validSignupRequest(),
      email: "OWNER@pasta.example.com",
      businessName: "다른 가게",
    });
    expect(dup.ok).toBe(false);
    if (!dup.ok) expect(dup.error.code).toBe("email_already_exists");
  });
});

describe("POST /signup — 검증 매트릭스(invalid_params)", () => {
  const cases: Array<{ name: string; patch: Record<string, unknown> }> = [
    { name: "email 형식 오류", patch: { email: "not-an-email" } },
    { name: "email 누락", patch: { email: "" } },
    { name: "password 8자 미만", patch: { password: "short7!" } },
    { name: "password 공백 포함", patch: { password: "has space 123" } },
    { name: "businessName 빈 값", patch: { businessName: "   " } },
    { name: "businessName 60자 초과", patch: { businessName: "가".repeat(61) } },
    { name: "industryKey 프리셋 밖", patch: { industryKey: "unknown_industry" } },
    {
      name: "other 인데 industryCustomLabel 누락",
      patch: { industryKey: "other", industryCustomLabel: "" },
    },
    {
      name: "other 인데 industryCustomLabel 30자 초과",
      patch: { industryKey: "other", industryCustomLabel: "가".repeat(31) },
    },
    { name: "contactPhone 문자 포함", patch: { contactPhone: "010-abcd-5678" } },
    { name: "contactPhone 숫자 9자리 미만", patch: { contactPhone: "0212-3456" } },
    { name: "contactPhone 숫자 13자리 초과", patch: { contactPhone: "01012345678901" } },
    { name: "plan 이 TENANT_PLANS 밖", patch: { plan: "platinum" } },
  ];

  for (const c of cases) {
    it(c.name, async () => {
      const h = makeAuthHarness();
      const res = await h.signupController.signup({
        ...validSignupRequest(),
        ...c.patch,
      } as never);
      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.error.code).toBe("invalid_params");
    });
  }

  it("검증 실패 시 테넌트/계정이 생성되지 않는다", async () => {
    const h = makeAuthHarness();
    await h.signupController.signup({
      ...validSignupRequest(),
      plan: "platinum",
    } as never);
    expect((await h.tenants.list()).length).toBe(0);
    expect((await h.accounts.listAll()).length).toBe(0);
  });
});
