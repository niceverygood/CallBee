/**
 * 사용자(사업장) 노출 라벨 사전 — brand-guide §5 용어 사전 준수.
 * 내부 코드 값(enum)은 그대로 두고 표시만 한글화한다.
 */
import type { CallOutcome } from "@colli/contracts";

/** 통화 결과 뱃지 라벨(통화 기록 목록/상세) */
export const OUTCOME_LABELS: Record<CallOutcome, string> = {
  kb_answered: "즉시 답변",
  ticket_created: "접수 완료",
  transferred: "담당자 연결",
  callback_queued: "콜백 예약",
  selfservice_sent: "안내 문자 발송",
  abandoned: "중도 종료",
  other: "기타",
};

/** 통화 결과 뱃지 톤(brand-guide §4.4 — 배경 50 + 텍스트 700 조합) */
export const OUTCOME_BADGE_TONES: Record<CallOutcome, string> = {
  kb_answered: "bg-success-50 text-success-700",
  ticket_created: "bg-info-50 text-info-600",
  transferred: "bg-brand-100 text-brand-800",
  callback_queued: "bg-warn-50 text-warn-700",
  selfservice_sent: "bg-info-50 text-info-600",
  abandoned: "bg-ink-100 text-ink-600",
  other: "bg-ink-100 text-ink-600",
};

/** 전사 화자 라벨 */
export const SPEAKER_LABELS = {
  caller: "고객",
  agent: "AI 상담원",
  system: "시스템",
} as const;

/** 문의하기 메일 주소(랜딩 푸터/승인 대기 화면 공용) */
export const SUPPORT_EMAIL = "hello@callbee.im";
