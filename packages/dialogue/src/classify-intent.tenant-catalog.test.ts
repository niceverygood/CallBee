/**
 * classifyIntent(utterance, catalog) — 테넌트 자유 의도 카탈로그 분류 테스트.
 *
 * catalog 미지정 시 기존 KEYWORD_MAP 폴백(classify-intent.test.ts, 16개)은
 * 무수정으로 유지된다. 이 파일은 catalog 지정 시의 신규 동작만 검증한다.
 */
import { describe, it, expect } from "vitest";
import type { TenantIntentDefinition, TenantIntentKey } from "@colli/contracts";
import { classifyIntent, BOBI_DEFAULT_TENANT_INTENTS } from "./classify-intent.js";

describe("classifyIntent(utterance, catalog) — BoBi 기본 카탈로그로도 동일 동작", () => {
  it("BOBI_DEFAULT_TENANT_INTENTS 로 usage 발화를 분류한다", () => {
    const r = classifyIntent("이 기능 어떻게 쓰는 건가요? 사용법 알려주세요", BOBI_DEFAULT_TENANT_INTENTS);
    expect(r.key).toBe("usage");
    expect(r.confidence).toBeGreaterThan(0);
  });

  it("BOBI_DEFAULT_TENANT_INTENTS 로 billing 발화를 분류한다", () => {
    const r = classifyIntent("카드 결제가 두 번 청구됐어요", BOBI_DEFAULT_TENANT_INTENTS);
    expect(r.key).toBe("billing");
  });

  it("무매칭 발화는 카탈로그 마지막(sortOrder 최대, other) 항목으로 폴백한다", () => {
    const r = classifyIntent("오늘 날씨 좋네요 안녕하세요", BOBI_DEFAULT_TENANT_INTENTS);
    expect(r.key).toBe("other");
    expect(r.confidence).toBe(0);
  });

  it("빈 발화 → 폴백 항목, confidence 0", () => {
    const r = classifyIntent("", BOBI_DEFAULT_TENANT_INTENTS);
    expect(r.key).toBe("other");
    expect(r.confidence).toBe(0);
  });
});

describe("classifyIntent(utterance, catalog) — 가상 테넌트(레스토랑) 카탈로그", () => {
  const key = (s: string) => s as unknown as TenantIntentKey;

  const RESTAURANT_INTENTS: TenantIntentDefinition[] = [
    {
      key: key("reservation"),
      label: "예약",
      keywords: ["예약", "자리", "몇 시", "테이블"],
      routingToolName: "check_reservation",
      sortOrder: 0,
      enabled: true,
    },
    {
      key: key("menu"),
      label: "메뉴 문의",
      keywords: ["메뉴", "가격", "코스", "맛"],
      routingToolName: "get_kb_answer",
      sortOrder: 1,
      enabled: true,
    },
    {
      key: key("complaint"),
      label: "불만 접수",
      keywords: ["불만", "항의", "별로였", "환불"],
      routingToolName: null,
      sortOrder: 2,
      enabled: true,
    },
    {
      key: key("other"),
      label: "기타",
      keywords: [],
      routingToolName: null,
      sortOrder: 3,
      enabled: true,
    },
  ];

  it("레스토랑 전용 키워드로 reservation 을 분류한다", () => {
    const r = classifyIntent("내일 저녁 7시에 4명 자리 예약하고 싶어요", RESTAURANT_INTENTS);
    expect(r.key).toBe("reservation");
  });

  it("레스토랑 전용 키워드로 menu 를 분류한다", () => {
    const r = classifyIntent("코스 메뉴 가격이 어떻게 되나요", RESTAURANT_INTENTS);
    expect(r.key).toBe("menu");
  });

  it("BoBi KEYWORD_MAP 은 이 카탈로그에 전혀 영향을 주지 않는다(완전 독립)", () => {
    // BoBi 스타일 발화("결제", "해지")는 레스토랑 카탈로그에 없는 키워드이므로 매칭되지 않는다.
    const r = classifyIntent("결제하고 해지할게요", RESTAURANT_INTENTS);
    expect(r.key).toBe("other");
  });

  it("disabled 항목은 매칭에서 제외된다", () => {
    const catalogWithDisabled: TenantIntentDefinition[] = RESTAURANT_INTENTS.map((i) =>
      i.key === "reservation" ? { ...i, enabled: false } : i,
    );
    const r = classifyIntent("자리 예약할게요", catalogWithDisabled);
    expect(r.key).not.toBe("reservation");
  });
});
