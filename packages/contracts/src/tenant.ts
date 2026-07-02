/**
 * Colli 플랫폼 — 멀티테넌트 계약 (단일 소스).
 *
 * Colli-BoBi(v1, BoBi 전용 단일테넌트)는 Colli 플랫폼(v2, 셀프서비스 멀티테넌트
 * AI 상담원 빌더)의 "테넌트 #1"로 흡수된다. 이 파일은 v2 에서 신규로 필요한
 * 테넌트/의도/커스텀tool/에이전트설정 타입만 추가한다.
 *
 * ⚠️ 하위호환 규칙:
 * - domain.ts 의 INTENTS(7종)/Intent, tools.ts 의 TOOL_NAMES(8종)/TOOL_SCHEMAS 는
 *   여전히 "BoBi 기본 의도 카탈로그" / "시스템 tool 카탈로그"로 그대로 유지된다.
 *   삭제·breaking rename 하지 않는다 — packages/dialogue 의 48개 테스트가 이
 *   export 들을 직접 참조한다.
 * - 여기 정의된 타입들은 "테넌트가 자유롭게 정의하는 축"(의도 카탈로그, 커스텀
 *   tool, 에이전트 설정)을 표현하는 런타임 계약이다. 컴파일타임 고정 유니온이
 *   아니라 DB(TenantIntent/TenantTool/TenantAgentConfig, @colli/db)에서 로드되는
 *   데이터 shape 라는 점이 domain.ts/tools.ts 의 고정 상수들과 다르다.
 *
 * 플랫폼 불변 가드레일(GUARDRAIL #1 결제정보 음성수집 금지, #2 상태변경은 tool
 * 경유, #3 고지·동의)은 이 파일에 "테넌트가 끌 수 있는 설정"으로 존재하지
 * 않는다 — packages/dialogue 의 system-prompt 빌더 내부에 코드로 하드코드되어
 * TenantAgentConfig 로 우회 불가능하다(자세한 내용은
 * /docs/tenant-platform-architecture.md 참조).
 */
import type { Intent, TicketCategory } from "./domain.js";
import type { SystemToolName, ToolJsonSchemaBase } from "./tools.js";

// ── 브랜드형 ID ─────────────────────────────────────────────────
import type { Brand } from "./domain.js";

export type TenantId = Brand<string, "TenantId">;
export type TenantIntentId = Brand<string, "TenantIntentId">;
export type TenantToolId = Brand<string, "TenantToolId">;

// ── 테넌트 상태/플랜 (Prisma enum 과 1:1 정렬) ──────────────────
// v3: 셀프 가입+승인 플로우 상태 2종 추가(pending_approval/rejected).
// 기존 3종은 그대로 유지(non-breaking 확장). Record<TenantStatus, ...> 를 쓰는
// 소비처(apps/admin 의 라벨 맵 등)는 신규 키 2개를 추가해야 typecheck 가 통과한다.
export const TENANT_STATUSES = [
  "onboarding",
  "active",
  "suspended",
  "pending_approval",
  "rejected",
] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

/** 사용자(사업장) 노출용 상태 라벨 — UI 는 이 라벨만 쓴다("테넌트" 등 내부 용어 노출 금지). */
export const TENANT_STATUS_LABELS: Record<TenantStatus, string> = {
  onboarding: "설정 중",
  active: "운영 중",
  suspended: "일시 정지",
  pending_approval: "승인 대기",
  rejected: "반려됨",
};

export const TENANT_PLANS = ["trial", "starter", "pro", "enterprise"] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

/**
 * 요금제 표시 메타(가입 위저드 3단계 카드/설정 화면 표시용 — 표시 전용).
 * ⚠️ 결제 연동은 하지 않는다(가드레일 #1: 결제는 셀프서비스 링크 원칙).
 * 선택값 저장 + 표시만 한다. 가격 변경은 이 상수만 수정하면 전 화면에 반영된다.
 */
export interface TenantPlanMeta {
  plan: TenantPlan;
  /** 카드 타이틀. 예: "스타터" */
  name: string;
  /** 월 가격(KRW). null = 가격 비공개(문의) 또는 무료 */
  monthlyPriceKrw: number | null;
  /** 가격 표기 문자열. 예: "₩49,000/월", "14일 무료", "문의" */
  priceLabel: string;
  /** 한 줄 설명(카드 서브카피) */
  description: string;
  /** 카드에 나열할 핵심 제공 항목 */
  features: string[];
  /** 무료 체험 기간(일). trial 전용 */
  trialDays?: number;
  /** "가장 인기" 하이라이트 카드 여부(위저드에서 1개만 true) */
  recommended?: boolean;
}

export const TENANT_PLAN_METAS: Record<TenantPlan, TenantPlanMeta> = {
  trial: {
    plan: "trial",
    name: "무료 체험",
    monthlyPriceKrw: null,
    priceLabel: "14일 무료",
    description: "부담 없이 AI 전화 응대를 직접 경험해 보세요.",
    features: [
      "14일 동안 모든 기능 사용",
      "전용 070 번호 배정",
      "AI 상담원 커스텀 전체",
      "통화 기록 열람",
    ],
    trialDays: 14,
  },
  starter: {
    plan: "starter",
    name: "스타터",
    monthlyPriceKrw: 49000,
    priceLabel: "₩49,000/월",
    description: "1인 사장님, 작은 매장을 위한 기본 요금제.",
    features: [
      "전용 070 번호 1개",
      "AI 상담원 커스텀 전체",
      "영업시간·문자 안내 설정",
      "통화 기록 열람",
    ],
  },
  pro: {
    plan: "pro",
    name: "프로",
    monthlyPriceKrw: 99000,
    priceLabel: "₩99,000/월",
    description: "전화가 많은 사업장을 위한 표준 요금제.",
    features: [
      "스타터의 모든 기능",
      "커스텀 연동(webhook tool)",
      "담당자 호전환·긴급 인계",
      "우선 지원",
    ],
    recommended: true,
  },
  enterprise: {
    plan: "enterprise",
    name: "엔터프라이즈",
    monthlyPriceKrw: null,
    priceLabel: "문의",
    description: "다지점·프랜차이즈, 맞춤 연동이 필요한 팀.",
    features: [
      "프로의 모든 기능",
      "복수 번호·지점 운영(로드맵)",
      "전담 온보딩 지원",
      "맞춤 계약",
    ],
  },
};

// ── 업종 프리셋 (가입 위저드 2단계 선택지 — 고정 카탈로그) ────────
/**
 * 셀프 가입 위저드에서 선택하는 업종 프리셋. Tenant.industryKey 에 key 가 저장되고,
 * 표시용 라벨은 Tenant.industryLabel 에 복사 저장된다("other" 는 직접 입력값 저장).
 * 프리셋별 추천 설정(인사말·의도 예시)은 docs/product-spec.md 참조 — 여기는
 * 위저드 렌더에 필요한 표시 메타만 둔다.
 */
export interface IndustryPreset {
  key: string;
  /** 위저드 카드 라벨 */
  label: string;
  /** 위저드 카드 서브카피(이 업종에서 콜비가 뭘 해주는지 한 줄) */
  description: string;
  /** 대표 문의 예시(카드 hover/상세, 온보딩 가이드 카피에 사용) */
  exampleAsks: string[];
}

export const INDUSTRY_PRESETS = [
  {
    key: "restaurant_cafe",
    label: "식당·카페",
    description: "예약, 영업시간, 메뉴 문의 전화를 대신 받아요.",
    exampleAsks: ["오늘 저녁 4명 예약돼요?", "주차 되나요?", "포장 주문할게요"],
  },
  {
    key: "hospital_clinic",
    label: "병원·의원",
    description: "진료 예약과 접수 문의를 놓치지 않아요.",
    exampleAsks: ["오늘 진료 몇 시까지예요?", "예약 변경하고 싶어요", "주말에도 하나요?"],
  },
  {
    key: "beauty",
    label: "미용·뷰티",
    description: "시술 예약과 가격 문의를 응대해요.",
    exampleAsks: ["펌 얼마예요?", "내일 오후 예약돼요?", "디자이너 지명할 수 있어요?"],
  },
  {
    key: "academy",
    label: "학원·교육",
    description: "상담 예약, 수강 문의, 셔틀 안내까지.",
    exampleAsks: ["초등 수학 반 있어요?", "레벨테스트 예약할게요", "수강료가 어떻게 되나요?"],
  },
  {
    key: "ecommerce",
    label: "쇼핑몰·이커머스",
    description: "배송·교환·환불 문의를 자동으로 접수해요.",
    exampleAsks: ["배송 언제 와요?", "사이즈 교환하고 싶어요", "환불 얼마나 걸려요?"],
  },
  {
    key: "real_estate",
    label: "부동산",
    description: "매물 문의를 접수하고 방문 상담을 잡아요.",
    exampleAsks: ["그 매물 아직 있어요?", "전세 물건 있나요?", "이번 주 방문 가능해요?"],
  },
  {
    key: "lodging",
    label: "숙박",
    description: "예약 확인, 체크인 안내, 부대시설 문의 응대.",
    exampleAsks: ["이번 주말 빈 방 있어요?", "체크인 몇 시부터예요?", "바베큐 되나요?"],
  },
  {
    key: "other",
    label: "기타",
    description: "어떤 업종이든 직접 입력해 시작할 수 있어요.",
    exampleAsks: [],
  },
] as const satisfies readonly IndustryPreset[];

export type IndustryPresetKey = (typeof INDUSTRY_PRESETS)[number]["key"];

export const INDUSTRY_PRESET_KEYS = INDUSTRY_PRESETS.map((p) => p.key) as IndustryPresetKey[];

export function findIndustryPreset(key: string): IndustryPreset | undefined {
  return INDUSTRY_PRESETS.find((p) => p.key === key);
}

// ── 070 번호 배정 컨벤션 ─────────────────────────────────────────
/**
 * 셀프 가입 신청 시점에는 070 번호가 없다(승인 시 관리자가 배정 — 현실 플로우).
 * Tenant.phoneNumber 는 NOT NULL + unique 를 유지해야 하므로(기존 컬럼 변경 금지),
 * 신청 시 "pending-{slug}" 플레이스홀더를 저장하고 승인 시 실번호로 교체한다.
 * UI 는 isPhoneNumberAssigned() 가 false 면 "미배정"으로 표시한다.
 */
export const PENDING_PHONE_PREFIX = "pending-";

export function makePendingPhoneNumber(slug: string): string {
  return `${PENDING_PHONE_PREFIX}${slug}`;
}

/** 실제 070 번호가 배정된 상태인지(플레이스홀더가 아닌지) 판별. */
export function isPhoneNumberAssigned(phoneNumber: string): boolean {
  return !phoneNumber.startsWith(PENDING_PHONE_PREFIX);
}

/**
 * 테넌트 요약 shape. @colli/db 의 Tenant 모델과 대응(Prisma 클라이언트 타입을
 * 직접 재노출하지 않고 계약으로 별도 정의 — DB 스키마 변경이 즉시 breaking
 * change 로 전파되지 않도록 완충한다).
 */
export interface TenantSummary {
  tenantId: TenantId;
  slug: string;
  name: string;
  /** 업종 라벨(자유 텍스트, 참고용). 예: "보험설계사 SaaS", "식당", "병원" */
  industryLabel: string | null;
  /**
   * 070 인바운드 라우팅 키(E.164). 승인 전에는 "pending-{slug}" 플레이스홀더가
   * 들어있을 수 있다 — 표시 전에 isPhoneNumberAssigned() 로 판별할 것.
   */
  phoneNumber: string;
  status: TenantStatus;
  plan: TenantPlan;

  // ── v3 셀프 가입/승인 플로우 필드(전부 optional — 하위호환) ──
  /** 가입 위저드 업종 프리셋 key(INDUSTRY_PRESETS). 관리자 직접 생성이면 없음 */
  industryKey?: IndustryPresetKey | string | null;
  /** 사업장 연락처(신청자 확인용, 070 아님) */
  contactPhone?: string | null;
  /** 셀프 가입 신청 시각(ISO8601). 관리자 직접 생성이면 null */
  appliedAt?: string | null;
  /** 승인 시각(ISO8601) */
  approvedAt?: string | null;
  /** 반려 시각(ISO8601) */
  rejectedAt?: string | null;
  /** 반려 사유(status=rejected 일 때 콘솔에 그대로 노출) */
  rejectionReason?: string | null;
}

// ── 테넌트별 의도 카탈로그(자유 정의) ───────────────────────────
/**
 * 테넌트가 정의하는 의도 1건. BoBi(테넌트 #1)는 INTENTS(7종)를 그대로 이
 * shape 7건으로 시딩한다(key 는 Intent 값과 동일 문자열).
 *
 * key 는 TenantIntentKey(문자열, 테넌트 스코프 유일) — CallSession.intent /
 * Ticket.category / KnowledgeItem.category 컬럼이 참조하는 값과 동일하다.
 */
export type TenantIntentKey = Brand<string, "TenantIntentKey">;

export interface TenantIntentDefinition {
  key: TenantIntentKey;
  label: string;
  /** classifyIntent 규칙기반 폴백용 키워드 목록 */
  keywords: string[];
  /**
   * 이 의도를 처리할 때 호출할 tool 이름. SYSTEM_TOOL_NAMES 중 하나이거나
   * 테넌트가 등록한 CustomToolDefinition.name. null 이면 get_kb_answer 기본
   * 폴백 등 플랫폼 기본 라우팅을 따른다.
   */
  routingToolName: SystemToolName | string | null;
  sortOrder: number;
  enabled: boolean;
}

/**
 * `Intent`(BoBi 고정 7종)를 `TenantIntentKey`로 취급하기 위한 헬퍼 타입.
 * BoBi 기본 카탈로그 시딩/마이그레이션 코드에서 `Intent` 값을 그대로
 * `TenantIntentKey` 자리에 넣을 때 타입 단언 대신 이 별칭을 사용한다.
 */
export type BoBiIntentKey = Intent;

// ── 테넌트별 커스텀 tool(webhook 기반) ──────────────────────────
/** OpenAI function-calling parameters 형식 JSON Schema(object 최상위 고정) */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties: false;
}

export interface JsonSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
}

/**
 * 테넌트가 대시보드에서 등록하는 커스텀 tool 1건 = LLM function 1개.
 * 실행은 apps/api 가 webhookUrl 로 POST 프록시한다(임의 코드 실행 없음).
 * @colli/db 의 TenantTool 모델과 대응.
 */
export interface CustomToolDefinition {
  toolId: TenantToolId;
  tenantId: TenantId;
  /** LLM function name. 테넌트 스코프 유일. SYSTEM_TOOL_NAMES 와 충돌 금지(검증은 apps/api). */
  name: string;
  description: string;
  paramsSchema: JsonSchemaObject;
  webhookUrl: string;
  /** HMAC-SHA256 서명용 시크릿 참조(평문은 여기 타입에 노출하지 않음 — DB/암호화 계층 책임) */
  hasWebhookSecret: boolean;
  timeoutMs: number;
  enabled: boolean;
}

/** apps/api 가 CustomToolDefinition → LLM 에 넘길 JSON Schema 로 변환한 결과 */
export interface CustomToolJsonSchema extends ToolJsonSchemaBase {
  name: string;
  kind: "custom";
}

// ── 영업시간 (TenantAgentConfig.businessHours Json 과 1:1) ───────
export const DAYS_OF_WEEK = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export const DAY_OF_WEEK_LABELS: Record<DayOfWeek, string> = {
  mon: "월",
  tue: "화",
  wed: "수",
  thu: "목",
  fri: "금",
  sat: "토",
  sun: "일",
};

/** 하루 영업시간. 시각은 "HH:mm" 24시간제(Asia/Seoul 기준, v1 은 타임존 고정). */
export interface BusinessDayHours {
  /** 예: "09:00" */
  open: string;
  /** 예: "18:00". open 보다 이르면 익일 마감(심야 영업)으로 해석한다 — 예: 18:00~02:00 */
  close: string;
  /** 브레이크타임 시작(옵션). 예: "15:00" */
  breakStart?: string;
  /** 브레이크타임 종료(옵션). 예: "17:00" */
  breakEnd?: string;
}

/**
 * 요일별 영업시간 + 휴무일. TenantAgentConfig.businessHours(Json 컬럼)의 정형 타입.
 * null 요일 = 정기 휴무. 전체가 저장 안 됐으면(businessHours null) 24시간 응대로 간주하고
 * 영업시간 관련 프롬프트 섹션/분기를 아예 생성하지 않는다(골든 패리티).
 */
export interface BusinessHours {
  days: Record<DayOfWeek, BusinessDayHours | null>;
  /** 임시 휴무일 목록("YYYY-MM-DD") */
  holidayDates?: string[];
  /** 공휴일 휴무 여부(공휴일 판정 데이터 연동은 로드맵 — v1 은 안내 문구에만 반영) */
  closedOnPublicHolidays?: boolean;
  /** 통화 안내에 덧붙일 비고. 예: "매월 마지막 주 월요일은 정기 휴무입니다" */
  note?: string | null;
}

// ── 영업시간 외 응대 방식 ────────────────────────────────────────
export const AFTER_HOURS_MODES = ["callback", "announce_hours"] as const;
export type AfterHoursMode = (typeof AFTER_HOURS_MODES)[number];

export const AFTER_HOURS_MODE_LABELS: Record<AfterHoursMode, string> = {
  callback: "콜백 접수 — 지금은 영업시간이 아님을 안내하고, 연락처와 용건을 받아 콜백을 예약합니다",
  announce_hours: "영업시간 안내 — 영업시간만 안내하고 정중히 통화를 마칩니다",
};

// ── 문자(SMS/알림톡) 안내 설정 (TenantAgentConfig.smsSettings Json 과 1:1) ──
/**
 * v1 범위: 설정 저장 + 프롬프트/정책 반영(통화 중 "문자로 안내드릴게요" 멘트 여부)까지.
 * 실제 발송은 기존 services/notifications 인프라를 재사용하되 자동 발송 배선은 로드맵.
 * 문구의 {업체명}/{고객명}/{콜백시간} 플레이스홀더 치환은 발송 시점 애플리케이션 책임.
 */
export interface SmsSettings {
  /** 접수 확인 문자(티켓/문의 접수 시) 발송 여부 */
  confirmationEnabled: boolean;
  /** 접수 확인 문구. null 이면 기본 문구("[{업체명}] 문의가 접수되었습니다. 순차적으로 연락드리겠습니다.") */
  confirmationText: string | null;
  /** 콜백 예약 안내 문자 발송 여부 */
  callbackNoticeEnabled: boolean;
  /** 콜백 예약 안내 문구. null 이면 기본 문구("[{업체명}] 콜백이 접수되었습니다. 영업시간 내에 연락드리겠습니다.") */
  callbackNoticeText: string | null;
  /** 영업시간 외 부재중 안내 문자 발송 여부 */
  missedCallEnabled: boolean;
  /** 부재중 안내 문구. null 이면 기본 문구("[{업체명}] 지금은 영업시간이 아닙니다. 영업시간에 다시 연락드리겠습니다.") */
  missedCallText: string | null;
}

/** 신규 테넌트 기본값 — 전부 꺼짐(문자 안내는 명시적 opt-in). */
export const DEFAULT_SMS_SETTINGS: SmsSettings = {
  confirmationEnabled: false,
  confirmationText: null,
  callbackNoticeEnabled: false,
  callbackNoticeText: null,
  missedCallEnabled: false,
  missedCallText: null,
};

// ── 테넌트별 에이전트 설정(system prompt/인사말 합성 재료) ─────────
/**
 * @colli/db 의 TenantAgentConfig 모델과 대응. 통짜 프롬프트 문자열이 아니라
 * 구조화 필드다 — buildSystemPrompt() 계열 함수가 이 필드들을 섹션별로
 * 조립하며, GUARDRAIL #1/#3 하드코드 섹션은 이 인터페이스에 필드 자체가
 * 없으므로 테넌트가 원천적으로 건드릴 수 없다.
 */
export interface TenantAgentConfig {
  tenantId: TenantId;
  serviceName: string;
  agentName: string;
  /** null 이면 "안녕하세요, {serviceName} 고객센터의 AI 상담원 {agentName}입니다." 기본 템플릿으로 합성 */
  greetingText: string | null;
  /** "# 역할" 섹션에 자유 서술로 추가되는 업종/서비스 설명 */
  personaInstructions: string | null;
  /** "# 대화 톤과 방식" 섹션에 추가로 append (플랫폼 기본 톤 규칙은 항상 유지) */
  toneExtra: string[];
  /** "# 절대 금지 — 업종 특화" 섹션 렌더 대상(플랫폼 불변 가드와 별개) */
  domainConstraints: string[];
  /** 의도 파악 반복 실패 시 폴백 tool 이름(기본 request_callback) */
  intentUnresolvedFallbackTool: string;
  /** 의도 파악 최대 재시도 횟수 */
  maxIntentAttempts: number;

  // ── v3 커스텀 확장(전부 optional — 하위호환. 값이 없으면 프롬프트 출력은
  //    v2 와 100% 동일해야 한다 = 골든 패리티 유지 조건) ──────────
  /** 마무리 멘트. null/미지정이면 플랫폼 기본 "# 마무리" 섹션 그대로 */
  closingText?: string | null;
  /** 영업시간. null/미지정이면 영업시간 섹션·분기 미생성(24시간 응대로 간주) */
  businessHours?: BusinessHours | null;
  /** 영업시간 외 응대 방식(기본 "callback"). businessHours 가 없으면 무시 */
  afterHoursMode?: AfterHoursMode;
  /** 영업시간 외 첫 안내 멘트 커스텀. null 이면 mode 별 기본 템플릿 */
  afterHoursText?: string | null;
  /** 담당자 호전환 번호(E.164). null 이면 호전환 안내 미생성 */
  transferPhoneNumber?: string | null;
  /** 긴급 키워드. 감지 시 즉시 사람 인계 최우선 지시. 빈 배열/미지정이면 섹션 생략 */
  emergencyKeywords?: string[];
  /** 문자 안내 설정. null/미지정이면 문자 안내 문구 미생성 */
  smsSettings?: SmsSettings | null;
}

// ── 런타임 조립 결과: 세션에 바인딩할 최종 tool 목록/의도 카탈로그 ──
/**
 * 콜 수신 시 070 번호로 테넌트를 조회한 뒤, 이 shape 하나로 조립해
 * apps/voice 의 세션 핸들러가 LLM 세션(system prompt + tools)에 바인딩한다.
 * 조립 로직(테넌트 조회 → 병합) 자체의 구현은 apps/api·apps/voice 몫이며,
 * 여기서는 그 결과 shape 만 계약으로 고정한다.
 */
export interface ResolvedTenantAgentContext {
  tenant: TenantSummary;
  agentConfig: TenantAgentConfig;
  /** 표시 순서(sortOrder)로 정렬된 의도 카탈로그. BoBi 는 INTENTS 7종이 여기 담긴다. */
  intents: TenantIntentDefinition[];
  /** 시스템 tool(TOOL_SCHEMA_LIST, 항상 전체 포함) + 테넌트 커스텀 tool(enabled 만) 병합 목록 */
  toolSchemas: Array<ToolJsonSchemaBase & { kind: "system" | "custom" }>;
}

/**
 * ResolvedTenantAgentContext 를 만드는 함수의 시그니처 계약(구현은 apps/api,
 * 여기서는 타입만 고정 — apps/voice 는 이 시그니처를 신뢰하고 호출한다).
 */
export type TenantAgentContextResolver = (
  toNumber: string,
) => Promise<ResolvedTenantAgentContext | null>;

// ── TicketCategory / KnowledgeItem.category 일반화 안내 ─────────
/**
 * v1 에서 `TicketCategory = Intent` 였던 별칭은 domain.ts 에 그대로 남아있다
 * (하위호환). v2 신규 코드가 "테넌트 자유 의도 key"를 다뤄야 하는 지점에서는
 * `TicketCategory` 대신 `TenantIntentKey` 를 사용한다. 두 타입 모두 런타임에는
 * 문자열이라 상호 대입 가능하지만, 신규 코드의 의도를 명확히 하기 위해
 * 아래처럼 유니온으로 문서화한다.
 */
export type TicketCategoryOrTenantIntentKey = TicketCategory | TenantIntentKey;
