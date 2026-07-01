import { describe, it, expect } from "vitest";
import type {
  ResolvedTenantAgentContext,
  RuntimeToolSchema,
  TenantAgentConfig,
  TenantId,
  TenantIntentDefinition,
  TenantIntentKey,
  TenantSummary,
  ToolResult,
} from "@colli/contracts";
import {
  simulateInboundCall,
  kbAnswerScenario,
  salesTransferScenario,
} from "./simulate.js";
import {
  BOBI_PHONE_NUMBER,
  BOBI_TENANT_CONTEXT,
} from "../ports/tenant-resolver-mock.js";
import { UNKNOWN_TENANT_TEXT } from "./session-handler.js";

/** 신규 가상 테넌트("두부식당") — BoBi 와 다른 070 번호/프롬프트/커스텀 tool */
const DUBU_TENANT_ID = "tenant_dubu" as TenantId;
const DUBU_PHONE_NUMBER = "07098765432";

const DUBU_SUMMARY: TenantSummary = {
  tenantId: DUBU_TENANT_ID,
  slug: "dubu-restaurant",
  name: "두부식당",
  industryLabel: "식당",
  phoneNumber: DUBU_PHONE_NUMBER,
  status: "active",
  plan: "starter",
};

const DUBU_AGENT_CONFIG: TenantAgentConfig = {
  tenantId: DUBU_TENANT_ID,
  serviceName: "두부식당",
  agentName: "두부",
  greetingText: "안녕하세요, 두부식당입니다. 예약 도와드릴까요?",
  personaInstructions: "두부식당은 예약제 한식당입니다. 예약/메뉴 문의만 응대합니다.",
  toneExtra: ["사투리 섞인 정겨운 말투를 사용합니다."],
  domainConstraints: ["알레르기 관련 의학적 조언을 하지 않습니다."],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};

const DUBU_INTENTS: TenantIntentDefinition[] = [
  {
    key: "reservation" as TenantIntentKey,
    label: "예약",
    keywords: ["예약", "자리"],
    routingToolName: "check_reservation",
    sortOrder: 0,
    enabled: true,
  },
];

const DUBU_CUSTOM_TOOL_SCHEMA: RuntimeToolSchema = {
  kind: "custom",
  name: "check_reservation",
  description: "예약 가능 여부를 조회한다.",
  parameters: {
    type: "object",
    properties: { date: { type: "string" } },
    required: ["date"],
    additionalProperties: false,
  },
};

const DUBU_TENANT_CONTEXT: ResolvedTenantAgentContext = {
  tenant: DUBU_SUMMARY,
  agentConfig: DUBU_AGENT_CONFIG,
  intents: DUBU_INTENTS,
  toolSchemas: [DUBU_CUSTOM_TOOL_SCHEMA],
};

describe("SessionHandler — 070 번호 기반 테넌트 라우팅", () => {
  it("BoBi 070 번호(07052361037)는 BoBi 톤의 system prompt + 시스템 tool 8종이 바인딩된다(회귀)", async () => {
    const { voiceAgent, clawops } = await simulateInboundCall({
      to: BOBI_PHONE_NUMBER,
      scenario: kbAnswerScenario(),
      toolHandlers: {
        get_kb_answer: (): ToolResult<"get_kb_answer"> => ({
          answer: "설정 > 리포트 > 내보내기에서 가능합니다.",
          sourceId: null,
          confidence: 0.92,
        }),
      },
    });

    const config = voiceAgent.lastSessionConfig;
    expect(config).not.toBeNull();
    expect(config?.systemPrompt).toContain("BoBi");
    expect(config?.systemPrompt).toContain("보비");
    // GUARDRAIL #1 문구가 항상 포함됨(테넌트가 끌 수 없음)
    expect(config?.systemPrompt).toContain("카드번호");
    // BoBi 도메인 제약(보험상품 상담 금지)이 반영됨
    expect(config?.systemPrompt).toContain("보험상품");

    const toolNames = (config?.tools ?? []).map((t) => t.name);
    expect(toolNames).toEqual(
      expect.arrayContaining([
        "lookup_subscriber",
        "get_kb_answer",
        "create_ticket",
        "route_to_sales",
        "send_selfservice_link",
        "request_callback",
        "escalate_to_human",
        "send_kakao_alimtalk",
      ]),
    );
    expect(config?.tools).toHaveLength(8);

    // 기존과 동일한 인사말·고지·tool 호출 순서 재현: answer → hang_up 왕복
    const kinds = clawops.actions.map((a) => a.kind);
    expect(kinds[0]).toBe("answer");
    expect(kinds).toContain("hangUp");
  });

  it("신규 가상 테넌트(두부식당, 다른 070 번호)는 커스텀 프롬프트/tool 이 바인딩된다", async () => {
    const { voiceAgent } = await simulateInboundCall({
      to: DUBU_PHONE_NUMBER,
      tenants: [BOBI_TENANT_CONTEXT, DUBU_TENANT_CONTEXT],
      scenario: {
        greeting: "예약 도와드릴까요?",
        userUtterance: "내일 저녁 4명 예약할 수 있나요?",
        tool: "check_reservation" as never,
        params: { date: "2026-07-02" } as never,
        closingLine: () => "예약 확인해드리겠습니다.",
        disposition: "hang_up",
      },
      toolHandlers: {},
    });

    const config = voiceAgent.lastSessionConfig;
    expect(config).not.toBeNull();
    expect(config?.systemPrompt).toContain("두부식당");
    expect(config?.systemPrompt).toContain("두부");
    expect(config?.systemPrompt).not.toContain("BoBi");
    // 두부식당 전용 도메인 제약 반영
    expect(config?.systemPrompt).toContain("알레르기");

    const tools = (config?.tools ?? []) as RuntimeToolSchema[];
    expect(tools.map((t) => t.name)).toEqual(["check_reservation"]);
    expect(tools.map((t) => t.kind)).toEqual(["custom"]);
  });

  it("미가입 070 번호는 안내 후 hang_up 하고 크래시/무한대기 없이 종료된다", async () => {
    const { clawops, repo, handler, toolClient } = await simulateInboundCall({
      to: "07000000000", // 등록되지 않은 070 번호
      scenario: kbAnswerScenario(),
      toolHandlers: {},
    });

    const kinds = clawops.actions.map((a) => a.kind);
    expect(kinds).toContain("answer");
    expect(kinds).toContain("hangUp");
    expect(kinds).not.toContain("startRecording"); // 고지/동의/녹음 흐름을 타지 않음
    expect(kinds).not.toContain("warmTransfer");

    const playPrompts = clawops.actionsOfKind("playPrompt");
    expect(playPrompts.some((p) => p.text === UNKNOWN_TENANT_TEXT)).toBe(true);

    // tool 호출이 전혀 일어나지 않음(세션 자체가 생성되지 않음)
    expect(toolClient.invocations).toHaveLength(0);

    // 통화 상태 정리됨(무한 대기 없음)
    expect(handler.liveCount).toBe(0);

    // 관측성: outcome=other + 실패사유 기록(GUARDRAIL #7)
    const session = [...repo.sessions.values()][0];
    expect(session?.outcome).toBe("other");
  });
});
