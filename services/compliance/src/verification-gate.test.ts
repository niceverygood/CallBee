import { describe, it, expect } from "vitest";
import type { SubscriberProfile, SubscriberId } from "@colli/contracts";
import {
  requireVerifiedSubscriber,
  requireSubscriberId,
  isVerified,
  verificationStateFromLookup,
  VerificationRequiredError,
} from "./verification-gate.js";

const profile: SubscriberProfile = {
  subscriberId: "sub_1" as SubscriberId,
  name: "홍길동",
  phone: "+821012345678",
  tier: "pro",
  status: "active",
  billingState: "current",
};

describe("requireVerifiedSubscriber — 본인확인 게이트", () => {
  it("미확인 상태에서는 VerificationRequiredError 를 던진다", () => {
    expect(() => requireVerifiedSubscriber({ verified: false })).toThrow(
      VerificationRequiredError,
    );
  });

  it("verified=true 지만 subscriber 없으면 차단한다", () => {
    expect(() =>
      requireVerifiedSubscriber({ verified: true, subscriber: null }),
    ).toThrow(VerificationRequiredError);
  });

  it("확인된 상태에서는 SubscriberProfile 을 반환한다", () => {
    const p = requireVerifiedSubscriber({
      verified: true,
      subscriber: profile,
    });
    expect(p.subscriberId).toBe("sub_1");
  });

  it("requireSubscriberId 는 확인 시 id 를 반환한다", () => {
    expect(
      requireSubscriberId({ verified: true, subscriber: profile }),
    ).toBe("sub_1");
  });
});

describe("verificationStateFromLookup", () => {
  it("lookup 결과 null 이면 미확인", () => {
    const state = verificationStateFromLookup(null);
    expect(isVerified(state)).toBe(false);
    expect(() => requireVerifiedSubscriber(state)).toThrow();
  });

  it("lookup 결과 프로필이면 확인됨", () => {
    const state = verificationStateFromLookup(profile);
    expect(isVerified(state)).toBe(true);
    expect(requireVerifiedSubscriber(state).name).toBe("홍길동");
  });
});
