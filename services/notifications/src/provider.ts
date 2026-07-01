/**
 * AlimtalkProvider — 카카오 비즈메시지 대행사 어댑터 경계 (GUARDRAIL #6).
 * 실제 대행사(HTTP)는 이 인터페이스 뒤에 캡슐화되어 교체 가능하다.
 * Worker D 는 서비스 로직에서 이 포트만 의존하고, 실제 HTTP 호출은 하지 않는다.
 */
import type { KakaoTemplateKey } from "@colli/contracts";

/**
 * 렌더링이 끝난, 대행사로 넘길 발송 페이로드.
 * `text` 는 템플릿 렌더러가 변수 바인딩을 마친 최종 알림톡 본문이다.
 */
export interface AlimtalkSendPayload {
  templateKey: KakaoTemplateKey;
  /** 수신 전화번호 */
  to: string;
  /** 변수 바인딩이 끝난 최종 본문 */
  text: string;
  /** 대행사 상관관계용 idempotency 키(선택) */
  idempotencyKey?: string;
}

/**
 * 대행사 발송 결과.
 * - accepted: 대행사가 발송을 접수(→ sent). providerMsgId 부여.
 * - rejected/error: 실패(→ 재시도 대상).
 */
export type AlimtalkSendResult =
  | { ok: true; providerMsgId: string }
  | { ok: false; error: { code: string; message: string } };

/**
 * 대행사 어댑터 포트. 실제 구현은 카카오 비즈메시지 HTTP 클라이언트로 스왑된다.
 */
export interface AlimtalkProvider {
  /** 렌더된 페이로드를 대행사로 발송한다. 성공 시 providerMsgId 반환. */
  send(payload: AlimtalkSendPayload): Promise<AlimtalkSendResult>;
}
