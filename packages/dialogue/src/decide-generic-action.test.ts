/**
 * decideGenericAction — "의도 1건당 tool 1개 직결" 라우팅 테스트.
 */
import { describe, it, expect } from "vitest";
import type { TenantIntentDefinition, TenantIntentKey } from "@colli/contracts";
import { decideGenericAction } from "./decide-generic-action.js";
import { BOBI_DEFAULT_TENANT_INTENTS } from "./classify-intent.js";
import { BOBI_DEFAULT_AGENT_CONFIG } from "./system-prompt.js";

const key = (s: string) => s as unknown as TenantIntentKey;

describe("decideGenericAction — BoBi 기본 카탈로그로 라우팅", () => {
  it("usage → get_kb_answer (routingToolName 그대로 직결)", () => {
    const d = decideGenericAction({ intent: "usage" }, BOBI_DEFAULT_TENANT_INTENTS, BOBI_DEFAULT_AGENT_CONFIG);
    expect(d.tool).toBe("get_kb_answer");
    expect(d.action).toBe("route_to_intent_tool");
  });

  it("billing → send_selfservice_link", () => {
    const d = decideGenericAction({ intent: "billing" }, BOBI_DEFAULT_TENANT_INTENTS, BOBI_DEFAULT_AGENT_CONFIG);
    expect(d.tool).toBe("send_selfservice_link");
  });

  it("upgrade/churn/new_signup → route_to_sales", () => {
    for (const intent of ["upgrade", "churn", "new_signup"]) {
      const d = decideGenericAction({ intent }, BOBI_DEFAULT_TENANT_INTENTS, BOBI_DEFAULT_AGENT_CONFIG);
      expect(d.tool).toBe("route_to_sales");
    }
  });

  it("other → routingToolName 없음 → get_kb_answer 폴백", () => {
    const d = decideGenericAction({ intent: "other" }, BOBI_DEFAULT_TENANT_INTENTS, BOBI_DEFAULT_AGENT_CONFIG);
    expect(d.tool).toBe("get_kb_answer");
    expect(d.action).toBe("answer_from_kb");
  });

  it("의도 없음 + 임계 미만 시도 → 되물음(tool null)", () => {
    const d = decideGenericAction(
      { intent: null, intentAttempts: 0 },
      BOBI_DEFAULT_TENANT_INTENTS,
      BOBI_DEFAULT_AGENT_CONFIG,
    );
    expect(d.tool).toBeNull();
    expect(d.action).toBe("reask");
  });

  it("의도 없음 + maxIntentAttempts 이상 시도 → intentUnresolvedFallbackTool 호출", () => {
    const d = decideGenericAction(
      { intent: null, intentAttempts: BOBI_DEFAULT_AGENT_CONFIG.maxIntentAttempts },
      BOBI_DEFAULT_TENANT_INTENTS,
      BOBI_DEFAULT_AGENT_CONFIG,
    );
    expect(d.tool).toBe("request_callback");
    expect(d.action).toBe("unresolved_fallback");
  });

  it("카탈로그에 없는 intent → 폴백 tool 호출", () => {
    const d = decideGenericAction(
      { intent: "not_in_catalog" },
      BOBI_DEFAULT_TENANT_INTENTS,
      BOBI_DEFAULT_AGENT_CONFIG,
    );
    expect(d.tool).toBe("request_callback");
    expect(d.action).toBe("unresolved_fallback");
    expect(d.matchedIntent).toBeNull();
  });
});

describe("decideGenericAction — 가상 테넌트(레스토랑) 카탈로그", () => {
  const RESTAURANT_INTENTS: TenantIntentDefinition[] = [
    {
      key: key("reservation"),
      label: "예약",
      keywords: ["예약"],
      routingToolName: "check_reservation",
      sortOrder: 0,
      enabled: true,
    },
    {
      key: key("complaint"),
      label: "불만 접수",
      keywords: ["불만"],
      routingToolName: null, // routingToolName 없음 → get_kb_answer 폴백 검증용
      sortOrder: 1,
      enabled: true,
    },
  ];

  const RESTAURANT_AGENT_CONFIG = {
    intentUnresolvedFallbackTool: "notify_manager",
    maxIntentAttempts: 1,
  };

  it("reservation → 커스텀 tool(check_reservation) 직결", () => {
    const d = decideGenericAction({ intent: "reservation" }, RESTAURANT_INTENTS, RESTAURANT_AGENT_CONFIG);
    expect(d.tool).toBe("check_reservation");
    expect(d.action).toBe("route_to_intent_tool");
  });

  it("complaint → routingToolName 없음 → get_kb_answer 폴백", () => {
    const d = decideGenericAction({ intent: "complaint" }, RESTAURANT_INTENTS, RESTAURANT_AGENT_CONFIG);
    expect(d.tool).toBe("get_kb_answer");
  });

  it("커스텀 intentUnresolvedFallbackTool(notify_manager)이 사용된다", () => {
    const d = decideGenericAction(
      { intent: null, intentAttempts: RESTAURANT_AGENT_CONFIG.maxIntentAttempts },
      RESTAURANT_INTENTS,
      RESTAURANT_AGENT_CONFIG,
    );
    expect(d.tool).toBe("notify_manager");
  });

  it("BoBi 카탈로그와 다른 테넌트가 다른 tool 로 라우팅됨을 보여준다(교차 검증)", () => {
    const bobi = decideGenericAction({ intent: "usage" }, BOBI_DEFAULT_TENANT_INTENTS, BOBI_DEFAULT_AGENT_CONFIG);
    const restaurant = decideGenericAction(
      { intent: "reservation" },
      RESTAURANT_INTENTS,
      RESTAURANT_AGENT_CONFIG,
    );
    expect(bobi.tool).toBe("get_kb_answer");
    expect(restaurant.tool).toBe("check_reservation");
    expect(bobi.tool).not.toBe(restaurant.tool);
  });
});
