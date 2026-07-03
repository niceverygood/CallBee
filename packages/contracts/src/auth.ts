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
import type {
  IndustryPresetKey,
  TenantId,
  TenantPlan,
  TenantStatus,
  TenantSummary,
} from "./tenant.js";
import type { ApplyIndustryTemplateResult } from "./industry-templates.js";

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
 * 카카오 로그인 콜백 코드 교환 요청 — POST /auth/kakao/callback.
 * 콘솔 프론트가 Kakao OAuth redirect 로 받은 code 를 백엔드에 전달하면,
 * 백엔드는 서버 보관 REST API key/client secret 으로 토큰을 교환하고
 * 카카오 계정 이메일과 기존 tenant_admin 계정을 매칭한다.
 */
export interface KakaoLoginCallbackRequest {
  code: string;
  /** Kakao Developers 에 등록된 Redirect URI. 코드 발급 때 사용한 값과 같아야 한다. */
  redirectUri: string;
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

// ── v3: 셀프 가입(공개) + 승인/반려 플로우 ───────────────────────
/**
 * 가입 위저드 3단계를 한 번에 제출하는 공개(무인증) 요청 — POST /signup.
 * ① 계정(email/password) ② 사업장 정보(businessName/industryKey/contactPhone)
 * ③ 요금제(plan). 성공 시 계정 + 테넌트(status=pending_approval)가 하나의
 * 트랜잭션으로 함께 생성되고, 즉시 로그인 토큰이 발급된다(승인 대기 화면 진입용).
 *
 * 검증 규칙(apps/api 구현 책임):
 * - email: 형식 검증 + AdminAccount 중복 시 email_already_exists.
 * - password: 8자 이상(공백 금지).
 * - businessName: 1~60자.
 * - industryKey: INDUSTRY_PRESETS 의 key 중 하나. "other" 면 industryCustomLabel 필수.
 * - contactPhone: 숫자/하이픈만, 9~13자리.
 * - plan: TENANT_PLANS 중 하나. 결제 연동 없음 — 선택값 저장+표시만.
 * - 070 번호는 받지 않는다 — 승인 시 관리자가 배정(makePendingPhoneNumber 참조).
 */
export interface SignupRequest {
  email: string;
  password: string;
  /** 사업장(업체) 표시명 */
  businessName: string;
  /** 업종 프리셋 key(INDUSTRY_PRESETS) */
  industryKey: IndustryPresetKey | string;
  /** industryKey === "other" 일 때 직접 입력한 업종명(필수) */
  industryCustomLabel?: string;
  /** 사업장 연락처(승인 심사·연락용, 070 아님) */
  contactPhone: string;
  /** 선택한 요금제(표시/저장 전용 — 결제 연동 없음) */
  plan: TenantPlan;
}

export interface SignupResult {
  tenantId: TenantId;
  account: AdminAccountSummary;
  /** 신청 직후 테넌트 상태 — 항상 "pending_approval" */
  tenantStatus: TenantStatus;
  /** 가입 즉시 발급되는 세션 토큰(콘솔이 바로 로그인 상태로 승인 대기 화면 표시) */
  token: string;
}

/**
 * 총괄관리자 승인 — POST /admin/tenants/:id/approve (platform_admin 전용).
 * 070 번호 배정이 승인의 필수 입력이다(현실 플로우: 번호는 관리자가 배정).
 * 성공 시 status=active, phoneNumber=배정번호, approvedAt=now.
 */
export interface ApproveTenantRequest {
  /** 배정할 070 번호(E.164/숫자열). unique 충돌 시 phone_number_taken 에러 */
  phoneNumber: string;
}

/**
 * 총괄관리자 반려 — POST /admin/tenants/:id/reject (platform_admin 전용).
 * 성공 시 status=rejected, rejectionReason/rejectedAt 기록. 사유는 콘솔의
 * 승인 대기(반려) 화면에 그대로 노출되므로 사용자에게 보여줄 문장으로 쓴다.
 */
export interface RejectTenantRequest {
  /** 반려 사유(필수, 1~500자) */
  reason: string;
}

/** 승인/반려 공통 응답 — 갱신된 테넌트 요약. */
export interface TenantReviewResult {
  tenant: TenantSummary;
  /**
   * 승인 시 자동 적용된 업종 팩 요약(approve 전용, v0.6.0).
   * - 가입 업종(industryKey)에 팩이 있으면 승인 성공 직후 비파괴 merge 로
   *   자동 적용된다(사장님이 스튜디오를 열기 전에 시작 설정이 깔려 있게).
   * - 팩이 없는 업종(other/미지정)이거나 reject 응답이면 null/미지정.
   * - 적용 실패는 승인을 실패시키지 않는다 — industryTemplateError 에 사유만
   *   담고 tenant 는 정상 active 로 반환된다(관리자 화면에서 안내).
   */
  industryTemplate?: ApplyIndustryTemplateResult | null;
  /** 자동 적용 실패 사유(성공/미대상이면 미지정) */
  industryTemplateError?: string;
}
