import { describe, it, expect } from "vitest";
import {
  paymentGuard,
  assertNoPaymentCollection,
  PaymentCollectionBlockedError,
} from "./payment-guard.js";

describe("paymentGuard", () => {
  it("billing 의도는 send_selfservice_link(billing)로 강제한다", () => {
    const d = paymentGuard("billing");
    expect(d.action).toBe("force_selfservice");
    if (d.action === "force_selfservice") {
      expect(d.tool).toBe("send_selfservice_link");
      expect(d.kind).toBe("billing");
    }
  });

  it("billing 이 아닌 의도는 정상 흐름을 허용한다", () => {
    for (const intent of [
      "usage",
      "tech_error",
      "upgrade",
      "churn",
      "new_signup",
      "other",
    ] as const) {
      expect(paymentGuard(intent).action).toBe("allow");
    }
  });
});

describe("assertNoPaymentCollection — 음성수집 차단", () => {
  it("카드번호가 포함되면 차단 예외를 던진다", () => {
    expect(() =>
      assertNoPaymentCollection("카드 4111-1111-1111-1111 불러드릴게요"),
    ).toThrow(PaymentCollectionBlockedError);
  });

  it("결제정보가 없으면 통과한다", () => {
    expect(() =>
      assertNoPaymentCollection("결제 관련 문의는 링크로 받을게요"),
    ).not.toThrow();
  });
});
