import { describe, it, expect } from "vitest";
import { maskPII, containsPaymentPII, PII_MASK } from "./pii-mask.js";

describe("maskPII — 카드번호", () => {
  it("4-4-4-4 하이픈 카드번호를 마스킹한다", () => {
    const r = maskPII("제 카드번호는 4111-1111-1111-1111 입니다");
    expect(r.masked).toContain(PII_MASK.card);
    expect(r.masked).not.toContain("4111-1111-1111-1111");
    expect(r.found.some((f) => f.kind === "card")).toBe(true);
  });

  it("공백 구분 16자리 카드번호를 마스킹한다", () => {
    const r = maskPII("5500 0000 0000 0004 로 결제해주세요");
    expect(r.masked).toContain(PII_MASK.card);
    expect(r.masked).not.toContain("5500 0000 0000 0004");
  });

  it("구분자 없는 16자리 연속 카드번호를 마스킹한다", () => {
    const r = maskPII("카드 4111111111111111 확인");
    expect(r.masked).toContain(PII_MASK.card);
    expect(r.masked).not.toContain("4111111111111111");
  });

  it("15자리 Amex 카드번호를 마스킹한다", () => {
    const r = maskPII("340000000000009 아멕스");
    expect(r.masked).toContain(PII_MASK.card);
  });
});

describe("maskPII — 계좌번호", () => {
  it("하이픈 그룹형 국내 계좌번호를 마스킹한다", () => {
    const r = maskPII("신한 110-123-456789 로 입금");
    expect(r.masked).toContain(PII_MASK.account);
    expect(r.masked).not.toContain("110-123-456789");
    expect(r.found.some((f) => f.kind === "account")).toBe(true);
  });

  it("4-2-7 형태 계좌번호를 마스킹한다", () => {
    const r = maskPII("계좌 3333-01-1234567 입니다");
    expect(r.masked).toContain(PII_MASK.account);
    expect(r.masked).not.toContain("3333-01-1234567");
  });

  it("구분자 없는 12자리 계좌번호를 마스킹한다", () => {
    const r = maskPII("계좌번호 123456789012 로 보내주세요");
    expect(r.masked).toContain(PII_MASK.account);
    expect(r.masked).not.toContain("123456789012");
  });
});

describe("maskPII — CVC", () => {
  it("cvc 키워드 뒤 3자리를 마스킹한다", () => {
    const r = maskPII("cvc 123 입니다");
    expect(r.masked).toContain(PII_MASK.cvc);
    expect(r.masked).not.toMatch(/\b123\b/);
    expect(r.found.some((f) => f.kind === "cvc")).toBe(true);
  });

  it("보안코드 키워드 뒤 3자리를 마스킹한다", () => {
    const r = maskPII("보안 코드는 456 이에요");
    expect(r.masked).toContain(PII_MASK.cvc);
  });

  it("cvv 4자리(amex)를 마스킹한다", () => {
    const r = maskPII("CVV: 7890");
    expect(r.masked).toContain(PII_MASK.cvc);
  });
});

describe("maskPII — 안전 텍스트/복합", () => {
  it("일반 문장은 그대로 둔다", () => {
    const text = "로그인이 안 돼요. 비밀번호를 잊어버렸습니다.";
    const r = maskPII(text);
    expect(r.masked).toBe(text);
    expect(r.found).toHaveLength(0);
  });

  it("전화번호(짧은 자리)는 카드로 오탐하지 않는다", () => {
    const r = maskPII("연락처는 010-1234 입니다");
    expect(r.masked).not.toContain(PII_MASK.card);
  });

  it("카드+CVC 섞인 발화를 모두 마스킹한다(전사·저장에 안 남음)", () => {
    const r = maskPII("카드 4111-1111-1111-1111 이고 cvc 321 이에요");
    expect(r.masked).not.toContain("4111-1111-1111-1111");
    expect(r.masked).not.toContain("321");
    expect(r.masked).toContain(PII_MASK.card);
    expect(r.masked).toContain(PII_MASK.cvc);
  });

  it("빈 문자열은 안전하게 통과한다", () => {
    const r = maskPII("");
    expect(r.masked).toBe("");
    expect(r.found).toHaveLength(0);
  });
});

describe("containsPaymentPII", () => {
  it("카드번호가 있으면 true", () => {
    expect(containsPaymentPII("4111 1111 1111 1111")).toBe(true);
  });
  it("일반 문장은 false", () => {
    expect(containsPaymentPII("안녕하세요 도와주세요")).toBe(false);
  });
});
