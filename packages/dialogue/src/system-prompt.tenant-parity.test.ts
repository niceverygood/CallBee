/**
 * buildTenantSystemPrompt 골든 패리티 테스트.
 *
 * docs/tenant-platform-architecture.md §4 의 BoBi 시드값으로
 * TenantSystemPromptContext 를 구성해 buildTenantSystemPrompt() 를 호출하고,
 * 결과 문자열에 GUARDRAIL 관련 필수 문구가 전부 포함되는지 검증한다. 완전히
 * 바이트 동일할 필요는 없지만(의도 렌더 방식이 살짝 다를 수 있음), 모든
 * GUARDRAIL 섹션 문구가 그대로 보존되어야 한다는 요구사항의 실제 검증 수단이다.
 */
import { describe, it, expect } from "vitest";
import { INTENT_LABELS } from "@colli/contracts";
import type { TenantAgentConfig, TenantIntentDefinition } from "@colli/contracts";
import {
  buildTenantSystemPrompt,
  buildSystemPrompt,
  BOBI_DEFAULT_AGENT_CONFIG,
  type TenantSystemPromptContext,
} from "./system-prompt.js";
import { BOBI_DEFAULT_TENANT_INTENTS } from "./classify-intent.js";

// docs/tenant-platform-architecture.md §4.2 시드값 그대로.
const BOBI_SEED_AGENT_CONFIG: TenantAgentConfig = {
  ...BOBI_DEFAULT_AGENT_CONFIG,
  serviceName: "BoBi",
  agentName: "보비",
  greetingText: null,
  personaInstructions:
    "BoBi는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다. 전화로 걸려온 BoBi 유료 구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다. 응대 범위는 BoBi(소프트웨어) 사용 지원에 한정됩니다.",
  toneExtra: [],
  domainConstraints: [
    "보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의 역할은 BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련 질문이 오면 escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.",
  ],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};

// docs/tenant-platform-architecture.md §4.3 시드값 그대로 (7행).
const BOBI_SEED_INTENTS: TenantIntentDefinition[] = BOBI_DEFAULT_TENANT_INTENTS;

function buildBobiSeedCtx(
  overrides: Partial<TenantSystemPromptContext> = {},
): TenantSystemPromptContext {
  return {
    agentConfig: BOBI_SEED_AGENT_CONFIG,
    intents: BOBI_SEED_INTENTS,
    ...overrides,
  };
}

describe("buildTenantSystemPrompt — BoBi 시드값 골든 패리티", () => {
  it("GUARDRAIL #1(결제정보 음성수집 금지) 문구를 포함한다", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(p).toContain("카드번호");
    expect(p).toContain("CVC");
    expect(p).toContain("send_selfservice_link");
  });

  it("GUARDRAIL #2(상태 변경은 tool 로만) 문구를 포함한다", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(p).toContain("tool");
    expect(p).toContain("반드시 제공된 tool 호출로만");
  });

  it("GUARDRAIL #3(통화 초입 고지·동의) 문구를 포함한다 (기본: 미완료)", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(p).toContain("AI 상담원이 응대");
    expect(p).toContain("녹음");
  });

  it("GUARDRAIL #4(본인확인) 문구를 포함한다", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(p).toContain("본인확인");
    expect(p).toContain("lookup_subscriber");
  });

  it("GUARDRAIL #5(보험상품 판단 금지, domainConstraints 렌더) 문구를 포함한다", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(p).toContain("보험상품");
    expect(p).toContain("권유·추천·비교·판단·진단성 발언을 하지 않습니다");
    expect(p).toContain("escalate_to_human");
  });

  it("7개 의도 라벨이 모두 렌더된다", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx());
    for (const label of Object.values(INTENT_LABELS)) {
      expect(p).toContain(label);
    }
  });

  it("consentAlreadyCaptured=true 면 고지 섹션이 생략된다(불변 로직 보존)", () => {
    const done = buildTenantSystemPrompt(buildBobiSeedCtx({ consentAlreadyCaptured: true }));
    const notDone = buildTenantSystemPrompt(buildBobiSeedCtx({ consentAlreadyCaptured: false }));
    expect(notDone).toContain("통화 시작");
    expect(done).not.toContain("통화 시작");
  });

  it("identityVerified=true 면 본인확인 완료 문구", () => {
    const p = buildTenantSystemPrompt(buildBobiSeedCtx({ identityVerified: true }));
    expect(p).toContain("본인확인이 완료");
  });

  it("결정론적: 동일 ctx → 동일 출력", () => {
    const ctx = buildBobiSeedCtx();
    expect(buildTenantSystemPrompt(ctx)).toBe(buildTenantSystemPrompt(ctx));
  });

  it("기존 buildSystemPrompt() 와 GUARDRAIL 핵심 문구 집합이 동등하다", () => {
    const legacy = buildSystemPrompt({ serviceName: "BoBi", agentName: "보비" });
    const tenant = buildTenantSystemPrompt(buildBobiSeedCtx());

    const guardrailPhrases = [
      "카드번호",
      "CVC",
      "send_selfservice_link",
      "녹음",
      "본인확인",
      "lookup_subscriber",
      "보험상품",
      "escalate_to_human",
    ];
    for (const phrase of guardrailPhrases) {
      expect(legacy).toContain(phrase);
      expect(tenant).toContain(phrase);
    }
  });
});

describe("buildTenantSystemPrompt — 가상 테넌트(레스토랑)로 다른 결과 조립", () => {
  const RESTAURANT_AGENT_CONFIG: TenantAgentConfig = {
    tenantId: "restaurant-demo-tenant" as TenantAgentConfig["tenantId"],
    serviceName: "맛있는집",
    agentName: "미소",
    greetingText: "안녕하세요, 맛있는집 예약센터의 AI 상담원 미소입니다.",
    personaInstructions: "맛있는집은 예약제로 운영되는 이탈리안 레스토랑입니다.",
    toneExtra: ["예약 시간과 인원수는 특히 정확히 복창해서 확인합니다."],
    domainConstraints: [
      "특정 메뉴가 알레르기에 안전하다고 단정하지 않습니다. 알레르기 문의는 반드시 매니저에게 인계합니다.",
    ],
    intentUnresolvedFallbackTool: "notify_manager",
    maxIntentAttempts: 3,
  };

  const RESTAURANT_INTENTS: TenantIntentDefinition[] = [
    {
      key: "reservation" as unknown as TenantIntentDefinition["key"],
      label: "예약",
      keywords: ["예약"],
      routingToolName: "check_reservation",
      sortOrder: 0,
      enabled: true,
    },
    {
      key: "menu" as unknown as TenantIntentDefinition["key"],
      label: "메뉴 문의",
      keywords: ["메뉴"],
      routingToolName: "get_kb_answer",
      sortOrder: 1,
      enabled: true,
    },
  ];

  it("BoBi 와 다른 인사말/의도 카탈로그/업종 제약이 렌더된다", () => {
    const bobi = buildTenantSystemPrompt(buildBobiSeedCtx());
    const restaurant = buildTenantSystemPrompt({
      agentConfig: RESTAURANT_AGENT_CONFIG,
      intents: RESTAURANT_INTENTS,
    });

    // 인사말이 다르다.
    expect(restaurant).toContain("맛있는집 예약센터의 AI 상담원 미소입니다");
    expect(bobi).not.toContain("맛있는집");

    // 의도 카탈로그가 다르다.
    expect(restaurant).toContain("reservation");
    expect(restaurant).toContain("check_reservation");
    expect(bobi).not.toContain("check_reservation");

    // 업종 특화 절대금지 섹션이 다르다.
    expect(restaurant).toContain("알레르기");
    expect(bobi).not.toContain("알레르기");

    // 플랫폼 불변 GUARDRAIL(#1/#3/#4)은 두 테넌트 모두 여전히 보존된다.
    for (const p of ["카드번호", "CVC", "본인확인", "lookup_subscriber", "AI 상담원이 응대", "녹음"]) {
      expect(restaurant).toContain(p);
      expect(bobi).toContain(p);
    }
  });

  it("toneExtra 가 톤 섹션에 반영된다(BoBi 는 기본 toneExtra=[] 라 없음)", () => {
    const restaurant = buildTenantSystemPrompt({
      agentConfig: RESTAURANT_AGENT_CONFIG,
      intents: RESTAURANT_INTENTS,
    });
    const bobi = buildTenantSystemPrompt(buildBobiSeedCtx());
    expect(restaurant).toContain("예약 시간과 인원수");
    expect(bobi).not.toContain("예약 시간과 인원수");
  });
});
