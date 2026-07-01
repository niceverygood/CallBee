import { describe, it, expect } from "vitest";
import type { CallSessionId } from "@colli/contracts";
import { makeTenantHarness } from "./tenant-harness.js";

const WEBHOOK_URL = "https://restaurant.example.com/webhook";

async function setupTenantWithTool(
  h: ReturnType<typeof makeTenantHarness>,
  overrides: Partial<{ webhookSecret: string | null; timeoutMs: number; enabled: boolean }> = {},
) {
  const tenant = await h.tenants.create({
    slug: "test-restaurant",
    name: "테스트 식당",
    phoneNumber: "07011112222",
  });
  const tool = await h.customTools.create(tenant.tenantId, {
    name: "check_reservation",
    description: "예약 가능 여부 확인",
    paramsSchema: {
      type: "object",
      properties: { date: { type: "string" } },
      required: ["date"],
      additionalProperties: false,
    },
    webhookUrl: WEBHOOK_URL,
    webhookSecret:
      "webhookSecret" in overrides ? overrides.webhookSecret : "topsecret",
    timeoutMs: overrides.timeoutMs ?? 8000,
    enabled: overrides.enabled ?? true,
  });
  return { tenant, tool };
}

describe("CustomToolExecutor — webhook tool 실행(전부 목, 실HTTP 없음)", () => {
  it("성공 시나리오: ok:true 응답을 그대로 전달 + trace 기록", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h);
    h.webhookInvoker.respond(WEBHOOK_URL, { ok: true, data: { available: true } });

    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId, callSessionId: "call_1" as CallSessionId },
    );

    expect(res).toEqual({
      ok: true,
      tool: "check_reservation",
      data: { available: true },
    });
    expect(h.trace.entries.length).toBe(1);
    expect(h.trace.entries[0]?.ok).toBe(true);
    expect(h.trace.entries[0]?.toolName).toBe("custom:check_reservation");
  });

  it("실패 시나리오: 테넌트 webhook 이 { ok:false, error } 반환 → 그대로 전달", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h);
    h.webhookInvoker.respond(WEBHOOK_URL, {
      ok: false,
      error: { code: "no_availability", message: "예약 가능한 자리가 없습니다" },
    });

    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("no_availability");
    expect(h.trace.entries[0]?.ok).toBe(false);
    expect(h.trace.entries[0]?.errorCode).toBe("no_availability");
  });

  it("타임아웃 시나리오: webhook_timeout 합성 실패 반환", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h, { timeoutMs: 100 });
    h.webhookInvoker.forceTimeout(WEBHOOK_URL);

    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("webhook_timeout");
  });

  it("등록되지 않은 tool 이름 → tool_not_found", async () => {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    const res = await h.executor.invoke(
      "no_such_tool",
      {},
      { tenantId: tenant.tenantId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_not_found");
  });

  it("enabled=false 인 tool 은 실행 거부", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h, { enabled: false });
    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_not_found");
  });

  it("paramsSchema 위반 파라미터는 webhook 호출 전에 invalid_params 로 차단", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h);
    const res = await h.executor.invoke(
      "check_reservation",
      { wrongField: 1 },
      { tenantId: tenant.tenantId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
    // webhook 이 호출되지 않았어야 함
    expect(h.webhookInvoker.calls.length).toBe(0);
  });

  it("webhookSecret 있으면 HMAC 서명이 invoker 요청에 실려간다", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h, { webhookSecret: "s3cr3t" });
    h.webhookInvoker.respond(WEBHOOK_URL, { ok: true, data: {} });

    await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );

    expect(h.webhookInvoker.calls.length).toBe(1);
    expect(h.webhookInvoker.calls[0]?.webhookSecret).toBeTruthy();
    expect(typeof h.webhookInvoker.calls[0]?.webhookSecret).toBe("string");
  });

  it("webhookSecret 없으면 서명 없이 호출된다", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h, { webhookSecret: null });
    h.webhookInvoker.respond(WEBHOOK_URL, { ok: true, data: {} });

    await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );

    expect(h.webhookInvoker.calls[0]?.webhookSecret).toBeNull();
  });

  it("malformed webhook 응답은 malformed_webhook_response 로 정규화", async () => {
    const h = makeTenantHarness();
    const { tenant } = await setupTenantWithTool(h);
    h.webhookInvoker.respond(WEBHOOK_URL, { unexpected: "shape" } as never);

    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenant.tenantId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("malformed_webhook_response");
  });

  it("다른 테넌트의 tool 은 조회되지 않는다(테넌트 격리)", async () => {
    const h = makeTenantHarness();
    const { tenant: tenantA } = await setupTenantWithTool(h);
    const tenantB = await h.tenants.create({
      slug: "another-tenant",
      name: "다른 테넌트",
      phoneNumber: "07099998888",
    });

    const res = await h.executor.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      { tenantId: tenantB.tenantId },
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_not_found");
    void tenantA;
  });
});
