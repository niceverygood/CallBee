/**
 * @colli/contracts — Colli-BoBi 공유 계약의 단일 진입점.
 * 모든 Worker 는 여기서만 타입/스키마/상수를 import 한다.
 */
export * from "./domain.js";
export * from "./tools.js";
export * from "./kakao.js";
export * from "./webhooks.js";
export * from "./tenant.js";
export * from "./auth.js";

/**
 * 계약 버전 — breaking change 시 증가(Orchestrator 승인 후 전파).
 * 0.2.0: 멀티테넌트 확장(tenant.ts 신규, SYSTEM_TOOL_NAMES/BOBI_DEFAULT_INTENTS
 * 별칭 추가). 기존 0.1.0 export 는 전부 유지되는 non-breaking 추가라
 * minor 만 올린다.
 * 0.3.0: 관리자 계정·인증 계약(auth.ts 신규 — AdminAccount, 로그인, 테넌트+계정
 * 동시 생성). 기존 export 는 전부 유지되는 non-breaking 추가.
 * 0.4.0: 셀프 가입+승인 플로우(SignupRequest/SignupResult/Approve·Reject,
 * TenantStatus 에 pending_approval/rejected 추가, INDUSTRY_PRESETS/
 * TENANT_PLAN_METAS 표시 메타) + 사업장 커스텀 확장(BusinessHours/AfterHoursMode/
 * SmsSettings, TenantAgentConfig optional 필드 7종). 기존 export 는 전부 유지 —
 * 단, TenantStatus 유니온이 넓어져 Record<TenantStatus,...> 소비처는 키 2개를
 * 추가해야 한다(apps/admin 라벨 맵 — admin 워커 브리핑에 명시).
 */
export const CONTRACTS_VERSION = "0.4.0" as const;
