/**
 * 사람이 읽는 라벨 매핑. Intent 라벨은 계약(INTENT_LABELS)을 재수출한다.
 * 나머지 enum 라벨(감정/결과/상태/심각도)은 대시보드 표시 전용이라 여기서 정의한다.
 */
import { INTENT_LABELS } from "@colli/contracts";
import type {
  Intent,
  Emotion,
  CallOutcome,
  TicketStatus,
  TicketSeverity,
  CallbackStatus,
  CallbackUrgency,
} from "@colli/contracts";

export { INTENT_LABELS };

export function intentLabel(intent: Intent | null): string {
  return intent ? INTENT_LABELS[intent] : "미분류";
}

export const EMOTION_LABELS: Record<Emotion, string> = {
  neutral: "중립",
  angry: "화남",
  urgent: "긴급",
  confused: "혼란",
};

export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  kb_answered: "KB 응답",
  ticket_created: "티켓 생성",
  transferred: "인계",
  callback_queued: "콜백 예약",
  selfservice_sent: "셀프서비스 발송",
  abandoned: "중도이탈",
  other: "기타",
};

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  open: "열림",
  in_progress: "진행중",
  resolved: "해결됨",
  closed: "종료",
};

export const TICKET_SEVERITY_LABELS: Record<TicketSeverity, string> = {
  low: "낮음",
  medium: "보통",
  high: "높음",
  critical: "심각",
};

export const CALLBACK_STATUS_LABELS: Record<CallbackStatus, string> = {
  queued: "대기",
  scheduled: "예약됨",
  completed: "완료",
  cancelled: "취소",
};

export const CALLBACK_URGENCY_LABELS: Record<CallbackUrgency, string> = {
  low: "낮음",
  normal: "보통",
  high: "높음",
};

// ── 색상 클래스(Tailwind) ───────────────────────────────────────
export const EMOTION_TONE: Record<Emotion, string> = {
  neutral: "bg-slate-100 text-slate-700",
  angry: "bg-red-100 text-red-700",
  urgent: "bg-orange-100 text-orange-700",
  confused: "bg-amber-100 text-amber-700",
};

export const TICKET_STATUS_TONE: Record<TicketStatus, string> = {
  open: "bg-blue-100 text-blue-700",
  in_progress: "bg-indigo-100 text-indigo-700",
  resolved: "bg-green-100 text-green-700",
  closed: "bg-slate-100 text-slate-600",
};

export const SEVERITY_TONE: Record<TicketSeverity, string> = {
  low: "bg-slate-100 text-slate-700",
  medium: "bg-yellow-100 text-yellow-800",
  high: "bg-orange-100 text-orange-700",
  critical: "bg-red-100 text-red-700",
};

export const CALLBACK_STATUS_TONE: Record<CallbackStatus, string> = {
  queued: "bg-amber-100 text-amber-800",
  scheduled: "bg-blue-100 text-blue-700",
  completed: "bg-green-100 text-green-700",
  cancelled: "bg-slate-100 text-slate-600",
};

export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatPercent(v: number): string {
  return `${Math.round(v * 100)}%`;
}
