import { describe, it, expect } from "vitest";
import { TOOL_SCHEMA_LIST } from "@colli/contracts";
import { buildRuntimeToolList } from "../tenant-resolver.service.js";
import { makeTenantHarness } from "./tenant-harness.js";

describe("buildRuntimeToolList — 시스템 tool ∪ 테넌트 커스텀 tool 병합", () => {
  it("커스텀 tool 이 없으면 시스템 tool 8종만 kind='system' 으로 반환", () => {
    const result = buildRuntimeToolList([]);
    expect(result.length).toBe(TOOL_SCHEMA_LIST.length);
    expect(result.every((s) => s.kind === "system")).toBe(true);
  });

  it("enabled 커스텀 tool 은 kind='custom' 으로 병합", () => {
    const result = buildRuntimeToolList([
      {
        name: "check_reservation",
        description: "예약 확인",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        enabled: true,
      },
    ]);
    const custom = result.filter((s) => s.kind === "custom");
    expect(custom.length).toBe(1);
    expect(custom[0]?.name).toBe("check_reservation");
  });

  it("enabled=false 인 커스텀 tool 은 제외된다", () => {
    const result = buildRuntimeToolList([
      {
        name: "disabled_tool",
        description: "비활성",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        enabled: false,
      },
    ]);
    expect(result.some((s) => s.name === "disabled_tool")).toBe(false);
  });

  it("이름 충돌 시 시스템 tool 이 우선(커스텀은 걸러짐)", () => {
    const result = buildRuntimeToolList([
      {
        name: "lookup_subscriber", // 시스템 tool 과 동일 이름
        description: "가짜 lookup",
        parameters: { type: "object", properties: {}, additionalProperties: false },
        enabled: true,
      },
    ]);
    const matches = result.filter((s) => s.name === "lookup_subscriber");
    expect(matches.length).toBe(1);
    expect(matches[0]?.kind).toBe("system");
  });
});

describe("TenantResolverService — 070 번호 → ResolvedTenantAgentContext 조립", () => {
  it("Tenant+AgentConfig+Intents+Tools 를 1회 조회로 조립한다", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
      status: "active",
    });
    await h.agentConfigs.upsert(tenant.tenantId, {
      serviceName: "BoBi",
      agentName: "보비",
      greetingText: null,
      personaInstructions: null,
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });
    await h.intents.create(tenant.tenantId, {
      key: "usage",
      label: "사용법",
      routingToolName: "get_kb_answer",
      sortOrder: 0,
    });

    const ctx = await h.resolver.resolveByPhoneNumber("07052361037");
    expect(ctx).not.toBeNull();
    expect(ctx?.tenant.slug).toBe("bobi");
    expect(ctx?.intents.length).toBe(1);
    expect(ctx?.toolSchemas.filter((s) => s.kind === "system").length).toBe(8);
  });

  it("에이전트 설정이 없으면 null (미완성 온보딩)", async () => {
    const h = makeTenantHarness();
    await h.tenants.create({
      slug: "onboarding-tenant",
      name: "온보딩중",
      phoneNumber: "07000001111",
    });
    const ctx = await h.resolver.resolveByPhoneNumber("07000001111");
    expect(ctx).toBeNull();
  });

  it("미등록 번호는 null", async () => {
    const h = makeTenantHarness();
    const ctx = await h.resolver.resolveByPhoneNumber("07099999999");
    expect(ctx).toBeNull();
  });

  it("가상 테넌트(test-restaurant)에 커스텀 tool 1개 등록 시 toolSchemas 에 병합된다", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07022223333",
      status: "active",
    });
    await h.agentConfigs.upsert(tenant.tenantId, {
      serviceName: "테스트 식당",
      agentName: "식당봇",
      greetingText: null,
      personaInstructions: "우리는 식당이고 예약 문의를 받습니다.",
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });
    await h.customTools.create(tenant.tenantId, {
      name: "check_reservation",
      description: "예약 가능 여부 확인",
      paramsSchema: {
        type: "object",
        properties: { date: { type: "string" } },
        required: ["date"],
        additionalProperties: false,
      },
      webhookUrl: "https://restaurant.example.com/webhook",
    });

    const ctx = await h.resolver.resolveByPhoneNumber("07022223333");
    expect(ctx).not.toBeNull();
    const custom = ctx?.toolSchemas.filter((s) => s.kind === "custom");
    expect(custom?.length).toBe(1);
    expect(custom?.[0]?.name).toBe("check_reservation");
    // 시스템 8종 + 커스텀 1종
    expect(ctx?.toolSchemas.length).toBe(9);
  });
});
