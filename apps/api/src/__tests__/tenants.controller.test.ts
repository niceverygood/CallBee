import { describe, it, expect } from "vitest";
import { makeTenantHarness, mockPlatformAdminReq } from "./tenant-harness.js";

describe("TenantsController — 테넌트 CRUD", () => {
  it("POST /tenants → 생성 성공", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.slug).toBe("test-restaurant");
  });

  it("POST /tenants → 필수값 누락 시 invalid_params", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.create({
      slug: "",
      name: "x",
      phoneNumber: "07011112222",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("GET /tenants/:id → 존재하지 않으면 tenant_not_found", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.getById(mockPlatformAdminReq(), "nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tenant_not_found");
  });

  it("PUT /tenants/:id → 상태 갱신", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const updated = await h.controller.update(mockPlatformAdminReq(), created.data.tenantId, {
      status: "active",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.status).toBe("active");
  });
});

describe("TenantsController — agent-config", () => {
  it("PUT 후 GET 으로 조회 가능", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    if (!created.ok) throw new Error("setup failed");

    const put = await h.controller.putAgentConfig(mockPlatformAdminReq(), created.data.tenantId, {
      serviceName: "BoBi",
      agentName: "보비",
      greetingText: null,
      personaInstructions: null,
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });
    expect(put.ok).toBe(true);

    const got = await h.controller.getAgentConfig(mockPlatformAdminReq(), created.data.tenantId);
    expect(got.ok).toBe(true);
    if (got.ok) expect(got.data.agentName).toBe("보비");
  });

  it("설정 없는 테넌트 GET → agent_config_not_found", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.getAgentConfig(mockPlatformAdminReq(), "nope");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("agent_config_not_found");
  });
});

describe("TenantsController — intents CRUD", () => {
  it("생성/조회/수정/삭제 전체 흐름", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    if (!created.ok) throw new Error("setup failed");
    const tenantId = created.data.tenantId;

    const createIntent = await h.controller.createIntent(mockPlatformAdminReq(), tenantId, {
      key: "usage",
      label: "사용법",
      routingToolName: "get_kb_answer",
    });
    expect(createIntent.ok).toBe(true);

    const list = await h.controller.listIntents(mockPlatformAdminReq(), tenantId);
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.length).toBe(1);

    const updated = await h.controller.updateIntent(mockPlatformAdminReq(), tenantId, "usage", {
      label: "사용 방법",
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.label).toBe("사용 방법");

    const del = await h.controller.deleteIntent(mockPlatformAdminReq(), tenantId, "usage");
    expect(del.ok).toBe(true);
    if (del.ok) expect(del.data.deleted).toBe(true);
  });
});

describe("TenantsController — tools CRUD (SSRF 방지 검증)", () => {
  it("정상 webhook tool 등록 성공", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await h.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
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
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data.name).toBe("check_reservation");
  });

  it("SYSTEM_TOOL_NAMES 와 이름 충돌 시 거부", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await h.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
      name: "lookup_subscriber",
      description: "충돌",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: "https://restaurant.example.com/webhook",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_name_conflicts_with_system_tool");
  });

  it("http:// webhook 은 거부", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await h.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: "http://restaurant.example.com/webhook",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("webhook_url_not_https");
  });

  it("사설 IP webhook 은 거부(SSRF)", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await h.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: "https://192.168.1.1/webhook",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("webhook_url_private_ip");
  });

  it("additionalProperties:false 아닌 paramsSchema 는 거부", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await h.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: { type: "object", properties: {}, additionalProperties: true },
      webhookUrl: "https://restaurant.example.com/webhook",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params_schema");
  });

  it("생성 후 목록/수정/삭제", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    if (!created.ok) throw new Error("setup failed");
    const tenantId = created.data.tenantId;

    const tool = await h.controller.createTool(mockPlatformAdminReq(), tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: "https://restaurant.example.com/webhook",
    });
    if (!tool.ok) throw new Error("tool create failed");

    const list = await h.controller.listTools(mockPlatformAdminReq(), tenantId);
    expect(list.ok).toBe(true);
    if (list.ok) expect(list.data.length).toBe(1);

    const updated = await h.controller.updateTool(mockPlatformAdminReq(), tenantId, tool.data.toolId, {
      enabled: false,
    });
    expect(updated.ok).toBe(true);
    if (updated.ok) expect(updated.data.enabled).toBe(false);

    const del = await h.controller.deleteTool(mockPlatformAdminReq(), tenantId, tool.data.toolId);
    expect(del.ok).toBe(true);
    if (del.ok) expect(del.data.deleted).toBe(true);
  });
});

describe("TenantsController — GET /tenants/resolve (070 라우팅)", () => {
  it("등록된 070 번호로 ResolvedTenantAgentContext 조립", async () => {
    const h = makeTenantHarness();
    const created = await h.controller.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
      status: "active",
    });
    if (!created.ok) throw new Error("setup failed");
    await h.controller.putAgentConfig(mockPlatformAdminReq(), created.data.tenantId, {
      serviceName: "BoBi",
      agentName: "보비",
      greetingText: null,
      personaInstructions: null,
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });

    const res = await h.controller.resolve("07052361037");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.tenant.slug).toBe("bobi");
      // 시스템 tool 8종은 항상 포함
      expect(res.data.toolSchemas.filter((s) => s.kind === "system").length).toBe(8);
    }
  });

  it("미등록 번호는 tenant_not_found", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.resolve("07099999999");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tenant_not_found");
  });
});
