/**
 * 가입/승인 플로우 테스트 하네스: 테넌트 하네스(tenant-harness.ts) 위에
 * AdminAccount 인메모리 저장소 + SignupController + AuthController 를 얹는다
 * (NestJS DI/HTTP 없이 컨트롤러 메서드를 직접 호출 — 기존 하네스 패턴 동일).
 */
import { InMemoryAdminAccountRepository } from "../auth/auth.repository.js";
import { SignupController } from "../signup.controller.js";
import { AuthController } from "../auth.controller.js";
import { makeTenantHarness } from "./tenant-harness.js";

export function makeAuthHarness() {
  const th = makeTenantHarness();
  const accounts = new InMemoryAdminAccountRepository();

  const signupController = new SignupController(
    th.tenants,
    th.agentConfigs,
    accounts,
  );
  const authController = new AuthController(
    th.tenants,
    th.agentConfigs,
    accounts,
    th.industryTemplates,
  );

  return { ...th, accounts, signupController, authController };
}

/** 검증 매트릭스 테스트용 — 항상 유효한 SignupRequest 베이스라인. */
export function validSignupRequest() {
  return {
    email: "owner@pasta.example.com",
    password: "secret-pass-1",
    businessName: "김윤정 파스타",
    industryKey: "restaurant_cafe",
    contactPhone: "010-1234-5678",
    plan: "trial" as const,
  };
}
