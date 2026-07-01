/**
 * 본인확인 게이트 (GUARDRAIL #4: 개인정보·구독 조회는 본인확인 후에만).
 *
 * `lookup_subscriber` 성공(구독자 매칭) 전에는 개인정보/구독 조회를 막는다.
 * Worker C 의 tool 구현이 개인정보성 tool 실행 직전에 이 가드를 통과시킨다.
 */

import type { SubscriberProfile, SubscriberId } from "@colli/contracts";

/**
 * 본인확인 상태. `lookup_subscriber` 결과로 채워진다.
 * verified=true 이며 subscriber 가 있으면 개인정보/구독 조회 허용.
 */
export interface VerificationState {
  verified: boolean;
  subscriber?: SubscriberProfile | null;
}

/** 본인확인이 필요한(개인정보/구독 조회) 민감 tool 목록. */
export const SUBSCRIBER_GATED_TOOLS = [
  "get_kb_answer", // 구독자 맥락 답변 시
  "create_ticket",
  "route_to_sales",
  "send_selfservice_link",
] as const;

export class VerificationRequiredError extends Error {
  readonly code = "VERIFICATION_REQUIRED";
  constructor(message = "본인확인(lookup_subscriber) 후에만 접근할 수 있습니다.") {
    super(message);
    this.name = "VerificationRequiredError";
  }
}

/**
 * 본인확인 게이트. 미확인이면 `VerificationRequiredError` 를 던진다.
 * 확인되었으면 매칭된 `SubscriberProfile` 을 반환한다(narrowing 지원).
 */
export function requireVerifiedSubscriber(
  state: VerificationState,
): SubscriberProfile {
  if (!state.verified || !state.subscriber) {
    throw new VerificationRequiredError();
  }
  return state.subscriber;
}

/** 예외 없이 boolean 만 원할 때. */
export function isVerified(state: VerificationState): boolean {
  return Boolean(state.verified && state.subscriber);
}

/** `lookup_subscriber` 결과로 검증 상태를 생성한다. null 이면 미확인. */
export function verificationStateFromLookup(
  result: SubscriberProfile | null,
): VerificationState {
  return { verified: result != null, subscriber: result };
}

/**
 * 검증된 상태에서 subscriberId 만 안전하게 꺼낸다.
 * 미확인이면 예외.
 */
export function requireSubscriberId(state: VerificationState): SubscriberId {
  return requireVerifiedSubscriber(state).subscriberId;
}
