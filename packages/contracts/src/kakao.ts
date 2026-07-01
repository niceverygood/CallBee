/**
 * 카카오 알림톡 템플릿 키 + 변수 계약 (단일 소스).
 * Worker D(알림)가 구현, Worker B/C 가 send_kakao_alimtalk 로 호출.
 */

export const KAKAO_TEMPLATE_KEYS = [
  "cs_received", // 접수 확인
  "ticket_created", // 티켓번호 안내
  "ticket_resolved", // 처리결과 안내
  "callback_scheduled", // 콜백 안내
  "selfservice_link", // 셀프서비스 링크
] as const;
export type KakaoTemplateKey = (typeof KAKAO_TEMPLATE_KEYS)[number];

// ── 템플릿별 변수 shape ─────────────────────────────────────────
export interface CsReceivedVars {
  name: string;
  receivedAt: string; // ISO8601
}
export interface TicketCreatedVars {
  name: string;
  ticketId: string;
  summary: string;
}
export interface TicketResolvedVars {
  name: string;
  ticketId: string;
  resolution: string;
}
export interface CallbackScheduledVars {
  name: string;
  scheduledAt: string; // ISO8601
}
export interface SelfServiceLinkVars {
  name: string;
  /** 셀프서비스 URL (결제/비번/요금제) */
  url: string;
  kind: "billing" | "password" | "plan_change";
}

/** 템플릿 키 → 변수 타입 매핑 */
export interface KakaoTemplateVarMap {
  cs_received: CsReceivedVars;
  ticket_created: TicketCreatedVars;
  ticket_resolved: TicketResolvedVars;
  callback_scheduled: CallbackScheduledVars;
  selfservice_link: SelfServiceLinkVars;
}

/** send_kakao_alimtalk 의 vars 는 템플릿 키에 상관없이 이 합집합을 받는다 */
export type KakaoTemplateVars =
  KakaoTemplateVarMap[keyof KakaoTemplateVarMap];

export const KAKAO_DELIVERY_STATUSES = [
  "queued",
  "sent",
  "delivered",
  "failed",
] as const;
export type KakaoDeliveryStatus = (typeof KAKAO_DELIVERY_STATUSES)[number];
