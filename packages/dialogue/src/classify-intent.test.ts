/**
 * classifyIntent 규칙 기반 분류 테스트.
 * decideAction 과 결합하면 7개 의도 각각 올바른 tool 경로로 이어짐도 확인.
 */
import { describe, it, expect } from "vitest";
import { INTENTS } from "@colli/contracts";
import { classifyIntent } from "./classify-intent.js";
import { decideAction } from "./decide-action.js";

describe("classifyIntent — 의도별 키워드", () => {
  const cases: Array<{ utterance: string; intent: string }> = [
    { utterance: "이 기능 어떻게 쓰는 건가요? 사용법 알려주세요", intent: "usage" },
    { utterance: "이번 달 결제 요금이 이상해요, 환불 되나요?", intent: "billing" },
    { utterance: "로그인이 안 돼요, 자꾸 오류가 납니다", intent: "tech_error" },
    { utterance: "프로 요금제로 업그레이드하고 싶어요", intent: "upgrade" },
    { utterance: "구독 해지하고 탈퇴하려고요", intent: "churn" },
    { utterance: "신규로 가입해서 새로 시작하고 싶어요", intent: "new_signup" },
    { utterance: "그냥 궁금한 게 있어서요", intent: "other" },
  ];

  for (const { utterance, intent } of cases) {
    it(`"${utterance}" → ${intent}`, () => {
      const r = classifyIntent(utterance);
      expect(r.intent).toBe(intent);
      expect(INTENTS).toContain(r.intent);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    });
  }

  it("빈 발화 → other, confidence 0", () => {
    expect(classifyIntent("")).toEqual({ intent: "other", confidence: 0 });
    expect(classifyIntent("   ")).toEqual({ intent: "other", confidence: 0 });
  });

  it("무매칭 잡담 → other", () => {
    const r = classifyIntent("오늘 날씨 좋네요 안녕하세요");
    expect(r.intent).toBe("other");
    expect(r.confidence).toBe(0);
  });
});

describe("classifyIntent → decideAction 엔드투엔드 (7종)", () => {
  const expected: Record<string, string | null> = {
    usage: "get_kb_answer",
    billing: "send_selfservice_link",
    tech_error: "create_ticket",
    upgrade: "route_to_sales",
    churn: "route_to_sales",
    new_signup: "route_to_sales",
    other: "get_kb_answer",
  };

  const utterances: Record<string, string> = {
    usage: "고객 명단 등록하는 방법이 궁금해요",
    billing: "카드 결제가 두 번 청구됐어요",
    tech_error: "앱이 자꾸 튕겨서 에러가 나요",
    upgrade: "요금제 변경해서 업그레이드할게요",
    churn: "이제 그만 쓸래요, 해지해주세요",
    new_signup: "회원가입하고 처음 쓰려고 하는데요",
    other: "음 그냥 뭐 좀 여쭤보려고요",
  };

  for (const intent of Object.keys(utterances)) {
    it(`${intent} 발화가 올바른 tool 로 라우팅된다`, () => {
      const { intent: classified, confidence } = classifyIntent(
        utterances[intent]!,
      );
      expect(classified).toBe(intent);
      const d = decideAction({
        intent: classified,
        // other 는 KB 시도 위해 높은 confidence 부여, 나머지는 무관
        confidence: Math.max(confidence, 0.9),
      });
      expect(d.tool).toBe(expected[intent]);
    });
  }
});
