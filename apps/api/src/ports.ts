/**
 * Worker C — 포트(어댑터 경계) 인터페이스.
 * GUARDRAIL #6: 외부 의존(BoBi DB, Prisma, Redis, Kakao)은 포트로 감싸 교체 가능하게.
 * ToolsService 는 이 포트들만 신뢰하고, 인프라 구현은 배선 시점(A/Orchestrator)에 주입한다.
 *
 * 공유 타입은 오직 @colli/contracts 에서 import (로컬 복제 금지).
 */
import type {
  SubscriberProfile,
  TicketId,
  TicketStatus,
  TicketCategory,
  TicketSeverity,
  CallbackId,
  CallbackUrgency,
  CallbackStatus,
  KnowledgeItemId,
  NotificationId,
  CallSessionId,
} from "@colli/contracts";
import type {
  KakaoTemplateKey,
  KakaoTemplateVars,
} from "@colli/contracts";

// ── BoBi 기존 구독 시스템 read 어댑터 (읽기 전용) ─────────────────
/**
 * BoBi 기존 DB/API 에서 구독자를 조회한다. 상태를 변경하지 않는다.
 * 전화번호 미매칭이면 null (본인확인 실패로 취급).
 * findById 는 본인확인 후 프로필 재조회(예: 셀프서비스 알림톡 수신번호)용.
 */
export interface BoBiReadPort {
  findByPhone(phone: string): Promise<SubscriberProfile | null>;
  findById(subscriberId: string): Promise<SubscriberProfile | null>;
}

// ── 알림(카카오 알림톡) — Worker D 로 위임 ──────────────────────
/**
 * send_kakao_alimtalk 은 이 포트로만 위임한다. 발송 내부 로직은 Worker D 소유.
 */
export interface NotificationsPort {
  send(input: {
    templateKey: KakaoTemplateKey;
    to: string;
    vars: KakaoTemplateVars;
    callSessionId?: CallSessionId;
    ticketId?: TicketId;
  }): Promise<{
    messageId: NotificationId;
    status: "sent" | "queued" | "failed";
  }>;
}

// ── 티켓 저장소 ─────────────────────────────────────────────────
export interface TicketRecord {
  id: TicketId;
  callSessionId: CallSessionId | null;
  subscriberId: string;
  category: TicketCategory;
  summary: string;
  severity: TicketSeverity;
  status: TicketStatus;
  assignee: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateTicketInput {
  callSessionId?: CallSessionId | null;
  subscriberId: string;
  category: TicketCategory;
  summary: string;
  severity: TicketSeverity;
}

export interface TicketRepository {
  create(input: CreateTicketInput): Promise<TicketRecord>;
  findById(id: TicketId): Promise<TicketRecord | null>;
  update(
    id: TicketId,
    patch: Partial<
      Pick<TicketRecord, "status" | "assignee" | "resolution" | "resolvedAt">
    >,
  ): Promise<TicketRecord | null>;
  list(filter?: {
    subscriberId?: string;
    status?: TicketStatus;
    category?: TicketCategory;
  }): Promise<TicketRecord[]>;
}

// ── 지식베이스 저장소 / 검색 ────────────────────────────────────
export interface KnowledgeRecord {
  id: KnowledgeItemId;
  category: TicketCategory;
  question: string;
  answer: string;
  keywords: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateKnowledgeInput {
  category: TicketCategory;
  question: string;
  answer: string;
  keywords?: string[];
  enabled?: boolean;
}

/** 검색 히트 (점수 포함) */
export interface KnowledgeHit {
  item: KnowledgeRecord;
  /** 0~1 매칭 신뢰도 */
  score: number;
}

export interface KnowledgeRepository {
  create(input: CreateKnowledgeInput): Promise<KnowledgeRecord>;
  /** 카테고리(선택) + 키워드 매칭. 점수 내림차순. */
  search(query: string, category?: TicketCategory): Promise<KnowledgeHit[]>;
  list(category?: TicketCategory): Promise<KnowledgeRecord[]>;
  getById(id: KnowledgeItemId): Promise<KnowledgeRecord | null>;
  update(
    id: KnowledgeItemId,
    patch: Partial<CreateKnowledgeInput>,
  ): Promise<KnowledgeRecord>;
  delete(id: KnowledgeItemId): Promise<void>;
}

// ── 콜백 큐 저장소 ──────────────────────────────────────────────
export interface CallbackRecord {
  id: CallbackId;
  callSessionId: CallSessionId | null;
  subscriberId: string | null;
  phone: string | null;
  summary: string;
  urgency: CallbackUrgency;
  status: CallbackStatus;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface EnqueueCallbackInput {
  callSessionId?: CallSessionId | null;
  subscriberId?: string | null;
  phone?: string | null;
  summary: string;
  urgency: CallbackUrgency;
}

export interface CallbackRepository {
  enqueue(input: EnqueueCallbackInput): Promise<CallbackRecord>;
  findById(id: CallbackId): Promise<CallbackRecord | null>;
  list(filter?: { status?: CallbackStatus }): Promise<CallbackRecord[]>;
}

// ── Redis 세션(통화별 상태) ─────────────────────────────────────
/**
 * 통화별 휘발성 상태(본인확인 여부, 의도 파악 실패 카운트 등).
 * 실구현은 Redis, 테스트는 인메모리.
 */
export interface CallSessionState {
  subscriberId?: string;
  verified?: boolean;
  /** 의도 파악 실패 횟수 (2회 초과 → 콜백, Worker B 정책과 연동) */
  intentFailures?: number;
  [key: string]: unknown;
}

export interface SessionStore {
  get(callSessionId: CallSessionId): Promise<CallSessionState | null>;
  set(callSessionId: CallSessionId, state: CallSessionState): Promise<void>;
  patch(
    callSessionId: CallSessionId,
    patch: Partial<CallSessionState>,
  ): Promise<CallSessionState>;
  delete(callSessionId: CallSessionId): Promise<void>;
}

// ── tool 호출 trace (관측성 GUARDRAIL #7) ───────────────────────
export interface TraceEntry {
  callSessionId: CallSessionId | null;
  toolName: string;
  /** 마스킹된 파라미터/결과 요약만 (PII·결제정보 금지) */
  paramsSummary?: Record<string, unknown> | null;
  ok: boolean;
  errorCode?: string | null;
  latencyMs?: number | null;
}

export interface TracePort {
  record(entry: TraceEntry): Promise<void>;
}
