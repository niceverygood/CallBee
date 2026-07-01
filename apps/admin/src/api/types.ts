/**
 * 관리자 대시보드가 소비하는 API DTO 타입.
 *
 * 도메인 enum/브랜드ID/라벨은 오직 `@colli/contracts` 에서 가져온다(로컬 복제 금지).
 * 아래 인터페이스는 Worker C(백엔드)가 노출해야 하는 "읽기 뷰모델"의 형태다.
 * 이 파일이 곧 프론트-백엔드 통합 계약(엔드포인트별 응답 shape)이다.
 */
import type {
  CallSessionId,
  ClawOpsCallId,
  SubscriberId,
  TicketId,
  CallbackId,
  KnowledgeItemId,
  Intent,
  Emotion,
  CallOutcome,
  CallDirection,
  SpeakerRole,
  TicketStatus,
  TicketSeverity,
  TicketCategory,
  CallbackStatus,
  CallbackUrgency,
} from "@colli/contracts";

// ── 통화 목록 항목 (GET /admin/calls) ──────────────────────────
export interface CallListItem {
  id: CallSessionId;
  clawOpsCallId: ClawOpsCallId;
  /** 발신번호(E.164) */
  from: string;
  /** 수신번호(070) */
  to: string;
  direction: CallDirection;
  intent: Intent | null;
  emotion: Emotion | null;
  outcome: CallOutcome | null;
  /** 본인확인된 구독자(있으면) */
  subscriberId: SubscriberId | null;
  subscriberName: string | null;
  /** ISO8601 */
  startedAt: string;
  durationSec: number;
}

// ── 전사 세그먼트 ──────────────────────────────────────────────
export interface TranscriptSegment {
  role: SpeakerRole;
  text: string;
  /** 통화 시작 기준 오프셋(초) */
  atSec: number;
}

// ── 통화 상세 (GET /admin/calls/:id) ───────────────────────────
export interface CallDetail extends CallListItem {
  /** 녹취 접근 URL(서명형). 없으면 재생 자리만 표시 */
  recordingUrl: string | null;
  /** AI 요약(관측성 산출물) */
  summary: string | null;
  transcript: TranscriptSegment[];
  /** 이 통화에서 호출된 tool 이름 순서(관측성 trace 요약) */
  toolInvocations: string[];
}

// ── 티켓 (GET /admin/tickets, PATCH /admin/tickets/:id) ─────────
export interface TicketRow {
  id: TicketId;
  subscriberId: SubscriberId;
  subscriberName: string | null;
  category: TicketCategory;
  summary: string;
  severity: TicketSeverity;
  status: TicketStatus;
  /** 담당자 표시명(미배정이면 null) */
  assignee: string | null;
  /** 유발 통화(있으면 상세로 이동) */
  callId: CallSessionId | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketUpdate {
  status?: TicketStatus;
  severity?: TicketSeverity;
  assignee?: string | null;
}

// ── 콜백 큐 (GET /admin/callbacks) ─────────────────────────────
export interface CallbackRow {
  id: CallbackId;
  subscriberId: SubscriberId | null;
  /** 콜백 대상 번호 */
  phone: string;
  subscriberName: string | null;
  summary: string;
  urgency: CallbackUrgency;
  status: CallbackStatus;
  /** 예약 시각(scheduled 일 때) */
  scheduledAt: string | null;
  createdAt: string;
}

// ── 지식베이스 (GET/POST/PUT/DELETE /admin/kb) ─────────────────
export interface KnowledgeItem {
  id: KnowledgeItemId;
  category: TicketCategory;
  question: string;
  answer: string;
  /** 검색 키워드 태그 */
  tags: string[];
  updatedAt: string;
}

/** 신규 생성 시 서버가 id/updatedAt 를 채운다 */
export type KnowledgeItemDraft = Omit<KnowledgeItem, "id" | "updatedAt">;

// ── 대시보드 지표 (GET /admin/metrics) ─────────────────────────
export interface DashboardMetrics {
  /** 응대율: 수신 대비 AI 응대(비-abandoned) 비율 0~1 */
  answerRate: number;
  /** 티켓 자동해결률: KB 로 해결된 문의 비율 0~1 */
  autoResolveRate: number;
  /** 사람 인계 수(기간 내) */
  handoffCount: number;
  /** 콜백 대기(queued) 수 */
  callbackWaiting: number;
  /** 총 통화 수(기간 내) */
  totalCalls: number;
  /** 열린 티켓 수 */
  openTickets: number;
}
