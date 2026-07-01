import { describe, it, expect } from "vitest";
import type { TenantId } from "@colli/contracts";
import { makeTenantHarness } from "./tenant-harness.js";

describe("TenantRepository — CRUD + 070 라우팅", () => {
  it("create → findById/findBySlug/findByPhoneNumber 로 조회 가능", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      industryLabel: "식당",
      phoneNumber: "07011112222",
    });
    expect(tenant.status).toBe("onboarding");
    expect(tenant.plan).toBe("trial");

    const byId = await h.tenants.findById(tenant.tenantId);
    expect(byId?.slug).toBe("test-restaurant");

    const bySlug = await h.tenants.findBySlug("test-restaurant");
    expect(bySlug?.tenantId).toBe(tenant.tenantId);

    const byPhone = await h.tenants.findByPhoneNumber("070-1111-2222");
    expect(byPhone?.tenantId).toBe(tenant.tenantId);
  });

  it("phoneNumber 정규화(공백/하이픈 무시) 매칭", async () => {
    const h = makeTenantHarness();
    await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    const found = await h.tenants.findByPhoneNumber("070 5236 1037");
    expect(found?.slug).toBe("bobi");
  });

  it("중복 slug/phoneNumber 는 생성 거부", async () => {
    const h = makeTenantHarness();
    await h.tenants.create({ slug: "bobi", name: "BoBi", phoneNumber: "07052361037" });
    await expect(
      h.tenants.create({ slug: "bobi", name: "BoBi2", phoneNumber: "07000000000" }),
    ).rejects.toThrow();
    await expect(
      h.tenants.create({ slug: "other", name: "Other", phoneNumber: "07052361037" }),
    ).rejects.toThrow();
  });

  it("update 로 상태/플랜 변경", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    const updated = await h.tenants.update(tenant.tenantId, {
      status: "active",
      plan: "enterprise",
    });
    expect(updated?.status).toBe("active");
    expect(updated?.plan).toBe("enterprise");
  });

  it("존재하지 않는 테넌트 update 는 null", async () => {
    const h = makeTenantHarness();
    const updated = await h.tenants.update("no-such" as TenantId, { name: "x" });
    expect(updated).toBeNull();
  });

  it("list 는 생성된 모든 테넌트를 반환", async () => {
    const h = makeTenantHarness();
    await h.tenants.create({ slug: "a", name: "A", phoneNumber: "07000000001" });
    await h.tenants.create({ slug: "b", name: "B", phoneNumber: "07000000002" });
    const list = await h.tenants.list();
    expect(list.length).toBe(2);
  });
});

describe("TenantAgentConfigRepository — upsert 멱등성", () => {
  it("최초 upsert 는 생성, 재호출은 갱신", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    const created = await h.agentConfigs.upsert(tenant.tenantId, {
      serviceName: "BoBi",
      agentName: "보비",
      greetingText: null,
      personaInstructions: null,
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });
    expect(created.tenantId).toBe(tenant.tenantId);

    const updated = await h.agentConfigs.upsert(tenant.tenantId, {
      ...created,
      agentName: "보비2",
    });
    expect(updated.agentName).toBe("보비2");

    const fetched = await h.agentConfigs.get(tenant.tenantId);
    expect(fetched?.agentName).toBe("보비2");
  });

  it("설정 없는 테넌트는 get 시 null", async () => {
    const h = makeTenantHarness();
    const got = await h.agentConfigs.get("no-such" as TenantId);
    expect(got).toBeNull();
  });
});

describe("TenantIntentRepository — CRUD", () => {
  it("create/list(sortOrder 정렬)/update/delete", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });

    await h.intents.create(tenant.tenantId, {
      key: "billing",
      label: "결제",
      sortOrder: 1,
      routingToolName: "send_selfservice_link",
    });
    await h.intents.create(tenant.tenantId, {
      key: "usage",
      label: "사용법",
      sortOrder: 0,
      routingToolName: "get_kb_answer",
    });

    const list = await h.intents.list(tenant.tenantId);
    expect(list.map((i) => i.key)).toEqual(["usage", "billing"]);

    const updated = await h.intents.update(tenant.tenantId, "billing", {
      label: "결제/환불",
    });
    expect(updated?.label).toBe("결제/환불");

    const deleted = await h.intents.delete(tenant.tenantId, "usage");
    expect(deleted).toBe(true);
    const listAfter = await h.intents.list(tenant.tenantId);
    expect(listAfter.map((i) => i.key)).toEqual(["billing"]);
  });

  it("중복 key 생성은 거부", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "bobi",
      name: "BoBi",
      phoneNumber: "07052361037",
    });
    await h.intents.create(tenant.tenantId, { key: "usage", label: "사용법" });
    await expect(
      h.intents.create(tenant.tenantId, { key: "usage", label: "중복" }),
    ).rejects.toThrow();
  });
});
