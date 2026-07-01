/**
 * Colli 플랫폼 — 관리자 계정 · 인증 계약 (단일 소스).
 *
 * 두 종류의 관리자 계정이 있다:
 * - platform_admin: 콜비(Colli) 총괄관리자. tenantId 없음(null). 모든 테넌트를
 *   조회하고, 신규 테넌트+계정을 생성할 수 있다(apps/admin, "콜비 총괄관리자").
 * - tenant_admin: 특정 테넌트 하나에 스코프된 관리자. 로그인하면 그 테넌트만
 *   보인다(apps/console, "에이전트 스튜디오"). BoBi(테넌트 #1)도 이 방식으로
 *   자기 계정을 갖는다 — 특별 취급하지 않는다.
 *
 * 이 파일은 타입/스키마만 정의한다. 실제 인증 로직(비밀번호 해시·세션 토큰
 * 발급/검증)은 apps/api 가 구현한다.
 */
import type { Brand } from "./domain.js";
import type { TenantId } from "./tenant.js";

export type AdminAccountId = Brand<string, "AdminAccountId">;

export const ADMIN_ROLES = ["platform_admin", "tenant_admin"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

/**
 * 계정 요약(비밀번호 등 민감정보 제외). 로그인 응답과 계정 목록 조회에 쓴다.
 */
export interface AdminAccountSummary {
  accountId: AdminAccountId;
  email: string;
  role: AdminRole;
  /** platform_admin 이면 null. tenant_admin 이면 필수. */
  tenantId: TenantId | null;
  createdAt: string;
}

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  account: AdminAccountSummary;
  /** 세션 토큰(불투명 문자열). 이후 요청에 Authorization: Bearer 로 첨부. */
  token: string;
}

/**
 * 콜비 총괄관리자가 신규 테넌트를 만들면서 그 테넌트의 첫 tenant_admin 계정도
 * 함께 발급하는 요청. apps/console 의 자기 온보딩(OnboardingDraft, 계정 없이
 * 신청만 접수)과 달리, 이건 platform_admin 전용이고 즉시 로그인 가능한 계정을
 * 만든다.
 */
export interface CreateTenantAccountRequest {
  companyName: string;
  industryLabel?: string;
  phoneNumber: string;
  adminEmail: string;
  adminPassword: string;
}

export interface CreateTenantAccountResult {
  tenantId: TenantId;
  account: AdminAccountSummary;
}
