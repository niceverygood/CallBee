/**
 * 결제정보 음성수집 차단 가드 (GUARDRAIL #1, 핵심).
 *
 * billing/결제 관련 의도는 반드시 `send_selfservice_link(kind='billing')` 로만 흐르게 강제한다.
 * 카드정보를 음성으로 수집하려는 시도를 차단하고 셀프서비스로 우회시키는 정책 훅.
 *
 * Worker B(대화 정책) / Worker C(tool 라우팅)가 billing 의도 처리 직전에 이 가드를 호출한다.
 */

import type { Intent, SelfServiceKind } from "@colli/contracts";
import { containsPaymentPII } from "./pii-mask.js";

/** 결제 셀프서비스로 강제해야 하는 의도. */
export const PAYMENT_INTENTS: readonly Intent[] = ["billing"] as const;

/** paymentGuard 결정. */
export type PaymentGuardDecision =
  | {
      /** 결제 의도 → 셀프서비스 강제 */
      action: "force_selfservice";
      tool: "send_selfservice_link";
      kind: SelfServiceKind; // 'billing'
      reason: string;
    }
  | {
      /** 결제 의도 아님 → 정상 흐름 허용 */
      action: "allow";
      reason: string;
    };

/**
 * 의도가 결제(billing)면 셀프서비스 링크로만 흐르도록 강제 결정을 반환한다.
 * 반환값을 Worker B/C 가 라우팅에 사용한다(자유 서술로 카드정보를 받지 않게).
 */
export function paymentGuard(intent: Intent): PaymentGuardDecision {
  if (PAYMENT_INTENTS.includes(intent)) {
    return {
      action: "force_selfservice",
      tool: "send_selfservice_link",
      kind: "billing",
      reason:
        "결제 관련 요청은 음성으로 카드/계좌 정보를 수집하지 않고 셀프서비스 링크로만 처리합니다.",
    };
  }
  return { action: "allow", reason: "결제 의도가 아니므로 정상 흐름을 허용합니다." };
}

export class PaymentCollectionBlockedError extends Error {
  readonly code = "PAYMENT_COLLECTION_BLOCKED";
  constructor(
    message = "결제/카드/계좌 정보는 음성으로 수집할 수 없습니다. 셀프서비스 링크로 안내하세요.",
  ) {
    super(message);
    this.name = "PaymentCollectionBlockedError";
  }
}

/**
 * 발화/전사 텍스트에 결제정보(카드/계좌/CVC)가 감지되면 예외를 던진다.
 * (저장·복창 직전 최종 방어선. 정상적으로는 maskPII 로 걸러지지만,
 *  "음성으로 카드번호를 받으려는 시도" 자체를 차단하는 강제 훅.)
 */
export function assertNoPaymentCollection(text: string): void {
  if (containsPaymentPII(text)) {
    throw new PaymentCollectionBlockedError();
  }
}
