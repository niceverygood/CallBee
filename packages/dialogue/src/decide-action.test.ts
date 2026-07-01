/**
 * decideAction 라우팅/에스컬레이션 시나리오 테스트.
 * 완료 기준: 7개 의도 각각 올바른 tool 경로/인계를 선택.
 */
import { describe, it, expect } from "vitest";
import { INTENTS } from "@colli/contracts";
import {
  decideAction,
  MAX_INTENT_ATTEMPTS,
  type DialogueState,
} from "./decide-action.js";

describe("decideAction — 7개 의도 라우팅", () => {
  it("usage → get_kb_answer (신뢰도 충분)", () => {
    const d = decideAction({ intent: "usage", confidence: 0.9 });
    expect(d.tool).toBe("get_kb_answer");
    expect(d.action).toBe("answer_from_kb");
  });

  it("billing → send_selfservice_link (kind=billing, 카드 음성수집 금지)", () => {
    const d = decideAction({ intent: "billing" });
    expect(d.tool).toBe("send_selfservice_link");
    expect(d.selfServiceKind).toBe("billing");
    expect(d.action).toBe("send_selfservice");
  });

  it("tech_error → create_ticket (개발팀)", () => {
    const d = decideAction({ intent: "tech_error" });
    expect(d.tool).toBe("create_ticket");
    expect(d.action).toBe("create_ticket");
  });

  it("upgrade → route_to_sales (reason=upgrade)", () => {
    const d = decideAction({ intent: "upgrade" });
    expect(d.tool).toBe("route_to_sales");
    expect(d.salesReason).toBe("upgrade");
  });

  it("churn → route_to_sales (reason=churn)", () => {
    const d = decideAction({ intent: "churn" });
    expect(d.tool).toBe("route_to_sales");
    expect(d.salesReason).toBe("churn");
  });

  it("new_signup → route_to_sales (reason=new_lead)", () => {
    const d = decideAction({ intent: "new_signup" });
    expect(d.tool).toBe("route_to_sales");
    expect(d.salesReason).toBe("new_lead");
  });

  it("other → get_kb_answer 시도 (신뢰도 충분)", () => {
    const d = decideAction({ intent: "other", confidence: 0.8 });
    expect(d.tool).toBe("get_kb_answer");
    expect(d.action).toBe("answer_from_kb");
  });

  it("모든 INTENTS 가 tool 또는 명시적 fallback 을 반환한다", () => {
    for (const intent of INTENTS) {
      const d = decideAction({ intent, confidence: 0.9 });
      // other 는 kb 시도, 나머지는 각자 tool. 어떤 경우도 정의된 결과.
      expect(d.reason.length).toBeGreaterThan(0);
      expect(d.action).toBeDefined();
    }
  });
});

describe("decideAction — 루프 가드 (의도 파악 실패)", () => {
  it("의도 미파악 + 2회 실패 → request_callback", () => {
    const state: DialogueState = {
      intent: null,
      intentAttempts: MAX_INTENT_ATTEMPTS,
    };
    const d = decideAction(state);
    expect(d.tool).toBe("request_callback");
    expect(d.action).toBe("request_callback");
  });

  it("other 로만 잡히고 2회 실패 → request_callback (무한 루프 금지)", () => {
    const d = decideAction({ intent: "other", intentAttempts: 2 });
    expect(d.tool).toBe("request_callback");
  });

  it("의도 미파악 + 1회 시도 → 되물음(reask), tool 없음", () => {
    const d = decideAction({ intent: null, intentAttempts: 1 });
    expect(d.tool).toBeNull();
    expect(d.action).toBe("reask");
  });
});

describe("decideAction — 보험상품 요청 → escalate", () => {
  it("보험상품 판단 요청은 의도 무관하게 escalate_to_human", () => {
    const d = decideAction({
      intent: "usage",
      confidence: 0.95,
      insuranceAdviceRequested: true,
    });
    expect(d.tool).toBe("escalate_to_human");
    expect(d.action).toBe("escalate");
    expect(d.escalationTarget).toBe("cs");
  });

  it("의도가 아직 없어도 보험상품 요청이면 escalate 우선", () => {
    const d = decideAction({
      intent: null,
      intentAttempts: 0,
      insuranceAdviceRequested: true,
    });
    expect(d.tool).toBe("escalate_to_human");
  });
});

describe("decideAction — usage/other 저신뢰 폴백", () => {
  it("usage + kbLowConfidence + 평상시 → request_callback", () => {
    const d = decideAction({ intent: "usage", kbLowConfidence: true });
    expect(d.tool).toBe("request_callback");
  });

  it("usage + 저신뢰 + 우선인계(angry) → escalate_to_human(cs)", () => {
    const d = decideAction({
      intent: "usage",
      confidence: 0.2,
      emotion: "angry",
    });
    expect(d.tool).toBe("escalate_to_human");
    expect(d.escalationTarget).toBe("cs");
  });

  it("other + 저신뢰 → request_callback", () => {
    const d = decideAction({ intent: "other", confidence: 0.1 });
    expect(d.tool).toBe("request_callback");
  });
});

describe("decideAction — 감정 힌트/우선인계", () => {
  it("angry 감정이면 emotionHint 와 prioritize=true 를 결과에 포함", () => {
    const d = decideAction({ intent: "tech_error", emotion: "angry" });
    expect(d.tool).toBe("create_ticket"); // 라우팅은 유지
    expect(d.prioritize).toBe(true);
    expect(d.emotionHint).not.toBeNull();
    expect(d.emotionHint).toContain("사과");
  });

  it("urgent 감정이면 prioritize=true", () => {
    const d = decideAction({ intent: "billing", emotion: "urgent" });
    expect(d.prioritize).toBe(true);
    expect(d.emotionHint).not.toBeNull();
  });

  it("neutral 이면 힌트 없음, prioritize=false", () => {
    const d = decideAction({ intent: "usage", confidence: 0.9 });
    expect(d.prioritize).toBe(false);
    expect(d.emotionHint).toBeNull();
  });
});
