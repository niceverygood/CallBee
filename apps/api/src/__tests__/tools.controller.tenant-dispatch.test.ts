import { describe, it, expect } from "vitest";
import type { CallSessionId, TenantId } from "@colli/contracts";
import { ToolsController } from "../tools.controller.js";
import { makeHarness, makeSubscriber } from "./harness.js";
import { makeTenantHarness } from "./tenant-harness.js";

const WEBHOOK_URL = "https://restaurant.example.com/webhook";

describe("ToolsController — 시스템 tool / 커스텀 tool 분기", () => {
  it("SYSTEM_TOOL_NAMES 이면 기존 ToolsService 로 라우팅(변경 없음)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    const res = await ctrl.invoke("lookup_subscriber", { phone: sub.phone }, "call_1");
    expect(res.ok).toBe(true);
  });

  it("커스텀 tool 이름이면 CustomToolExecutor 로 위임(tenantId 헤더 필요)", async () => {
    const h = makeHarness();
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    const tenant = await th.tenants.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    await th.customTools.create(tenant.tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: {
        type: "object",
        properties: { date: { type: "string" } },
        required: ["date"],
        additionalProperties: false,
      },
      webhookUrl: WEBHOOK_URL,
    });
    th.webhookInvoker.respond(WEBHOOK_URL, { ok: true, data: { available: true } });

    const res = await ctrl.invoke(
      "check_reservation",
      { date: "2026-07-01" },
      "call_1",
      tenant.tenantId,
    );
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.data).toEqual({ available: true });
  });

  it("커스텀 tool 인데 x-tenant-id 헤더 누락 → missing_tenant_id", async () => {
    const h = makeHarness();
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    const res = await ctrl.invoke("check_reservation", { date: "x" }, "call_1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("missing_tenant_id");
  });

  it("CustomToolExecutor 미주입(하위호환 경로) + 알 수 없는 이름 → unknown_tool", async () => {
    const h = makeHarness();
    const ctrl = new ToolsController(h.service);
    const res = await ctrl.invoke("no_such_tool", {}, "call_1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("unknown_tool");
  });

  it("존재하지 않는 커스텀 tool 이름 → tool_not_found(테넌트 스코프 조회 실패)", async () => {
    const h = makeHarness();
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);
    const res = await ctrl.invoke(
      "ghost_tool",
      {},
      "call_1",
      "no-such-tenant" as TenantId,
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_not_found");
  });

  it("세션 헤더가 커스텀 tool trace 로 이어진다", async () => {
    const h = makeHarness();
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    const tenant = await th.tenants.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      phoneNumber: "07011112222",
    });
    await th.customTools.create(tenant.tenantId, {
      name: "check_reservation",
      description: "예약 확인",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: WEBHOOK_URL,
    });
    th.webhookInvoker.respond(WEBHOOK_URL, { ok: true, data: {} });

    const sid = "call_hdr" as CallSessionId;
    await ctrl.invoke("check_reservation", {}, sid, tenant.tenantId);
    expect(th.trace.entries[0]?.callSessionId).toBe(sid);
  });
});
