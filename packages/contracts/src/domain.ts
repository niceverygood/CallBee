/**
 * Colli-BoBi 공유 도메인 타입 (단일 소스).
 * Worker A~F 는 이 타입들만 신뢰하고 로컬에 복제하지 않는다.
 */

// ── 브랜드형 ID (문자열 오용 방지) ──────────────────────────────
export type Brand<T, B extends string> = T & { readonly __brand: B };

export type SubscriberId = Brand<string, "SubscriberId">;
export type CallSessionId = Brand<string, "CallSessionId">;
export type TicketId = Brand<string, "TicketId">;
export type CallbackId = Brand<string, "CallbackId">;
export type NotificationId = Brand<string, "NotificationId">;
export type KnowledgeItemId = Brand<string, "KnowledgeItemId">;
export type ConsentRecordId = Brand<string, "ConsentRecordId">;

/** ClawOps 콜 식별자 (외부 시스템 소유) */
export type ClawOpsCallId = Brand<string, "ClawOpsCallId">;

// ── 의도 분류 (7종, Worker B 라우팅 기준) ───────────────────────
// v2(멀티테넌트)에서 이 7종은 "BoBi(테넌트 #1) 기본 의도 카탈로그"로
// 재해석된다. 신규 테넌트는 자유 의도(TenantIntentKey, @colli/contracts/
// tenant.ts)를 정의하므로 이 고정 유니온에 얽매이지 않는다.
// `INTENTS`/`Intent` 는 하위호환을 위해 삭제하지 않고 그대로 유지한다
// (packages/dialogue 의 48개 테스트가 이 이름으로 직접 import 한다).
export const INTENTS = [
  "usage", // 사용법
  "billing", // 결제
  "tech_error", // 기술오류
  "upgrade", // 요금제·업그레이드
  "churn", // 해지
  "new_signup", // 신규가입
  "other", // 기타
] as const;
export type Intent = (typeof INTENTS)[number];

/** `INTENTS` 의 하위호환 별칭 — "BoBi(테넌트 #1) 기본 의도 카탈로그"라는 의미를 명시. */
export const BOBI_DEFAULT_INTENTS = INTENTS;
/** `Intent` 의 하위호환 별칭. */
export type BoBiDefaultIntent = Intent;

/** 사람이 읽는 라벨(로그·대시보드용) */
export const INTENT_LABELS: Record<Intent, string> = {
  usage: "사용법",
  billing: "결제",
  tech_error: "기술오류",
  upgrade: "요금제·업그레이드",
  churn: "해지",
  new_signup: "신규가입",
  other: "기타",
};

// ── 감정 태깅 (Worker B → 우선 인계 힌트) ───────────────────────
export const EMOTIONS = ["neutral", "angry", "urgent", "confused"] as const;
export type Emotion = (typeof EMOTIONS)[number];

// ── 티켓 ────────────────────────────────────────────────────────
export const TICKET_SEVERITIES = ["low", "medium", "high", "critical"] as const;
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number];

export const TICKET_STATUSES = [
  "open",
  "in_progress",
  "resolved",
  "closed",
] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

/** 티켓 카테고리 = 의도와 정렬 */
export type TicketCategory = Intent;

// ── 콜백 ────────────────────────────────────────────────────────
export const CALLBACK_URGENCIES = ["low", "normal", "high"] as const;
export type CallbackUrgency = (typeof CALLBACK_URGENCIES)[number];

export const CALLBACK_STATUSES = [
  "queued",
  "scheduled",
  "completed",
  "cancelled",
] as const;
export type CallbackStatus = (typeof CALLBACK_STATUSES)[number];

// ── 인계 / 라우팅 ───────────────────────────────────────────────
export const SALES_REASONS = ["upgrade", "churn", "new_lead"] as const;
export type SalesReason = (typeof SALES_REASONS)[number];

export const ROUTE_MODES = ["warm_transfer", "callback_queued"] as const;
export type RouteMode = (typeof ROUTE_MODES)[number];

export const ESCALATION_TARGETS = ["sales", "dev", "cs"] as const;
export type EscalationTarget = (typeof ESCALATION_TARGETS)[number];

// ── 셀프서비스 링크 ─────────────────────────────────────────────
export const SELFSERVICE_KINDS = ["billing", "password", "plan_change"] as const;
export type SelfServiceKind = (typeof SELFSERVICE_KINDS)[number];

// ── 구독 상태 (BoBi 기존 시스템 — 읽기 전용) ────────────────────
export const SUBSCRIPTION_TIERS = ["free", "basic", "pro", "enterprise"] as const;
export type SubscriptionTier = (typeof SUBSCRIPTION_TIERS)[number];

export const SUBSCRIPTION_STATUSES = [
  "active",
  "past_due",
  "cancelled",
  "trial",
] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const BILLING_STATES = ["current", "past_due", "grace", "suspended"] as const;
export type BillingState = (typeof BILLING_STATES)[number];

/**
 * BoBi 기존 DB/API 에서 읽기 전용으로 조회하는 구독자 요약.
 * Worker C 의 read 어댑터가 반환한다. Colli-BoBi 는 이 데이터를 소유·변경하지 않는다.
 */
export interface SubscriberProfile {
  subscriberId: SubscriberId;
  name: string;
  /** 가입 전화번호(E.164, 본인확인 기준) */
  phone: string;
  tier: SubscriptionTier;
  status: SubscriptionStatus;
  billingState: BillingState;
}

// ── 통화 세션 ───────────────────────────────────────────────────
export const CALL_DIRECTIONS = ["inbound", "outbound"] as const;
export type CallDirection = (typeof CALL_DIRECTIONS)[number];

export const CALL_OUTCOMES = [
  "kb_answered",
  "ticket_created",
  "transferred",
  "callback_queued",
  "selfservice_sent",
  "abandoned",
  "other",
] as const;
export type CallOutcome = (typeof CALL_OUTCOMES)[number];

/** 통화 참여자 역할 (전사 세그먼트) */
export const SPEAKER_ROLES = ["caller", "agent", "system"] as const;
export type SpeakerRole = (typeof SPEAKER_ROLES)[number];
