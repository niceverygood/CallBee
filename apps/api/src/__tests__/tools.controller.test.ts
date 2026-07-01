import { describe, it, expect } from "vitest";
import type { CallSessionId, SubscriberId } from "@colli/contracts";
import { ToolsController } from "../tools.controller.js";
import { makeHarness, makeSubscriber } from "./harness.js";

// 컨트롤러는 NestJS 부트스트랩 없이 직접 인스턴스화(ESM/데코레이터 마찰 회피).
describe("ToolsController — ToolInvocationResult 봉투", () => {
  it("성공: { ok:true, tool, data }", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    const ctrl = new ToolsController(h.service);

    const res = await ctrl.invoke(
      "lookup_subscriber",
      { phone: sub.phone },
      "call_1",
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.tool).toBe("lookup_subscriber");
      expect(res.data).not.toBeNull();
    }
  });

  it("도메인 오류: { ok:false, error.code }", async () => {
    const h = makeHarness();
    const ctrl = new ToolsController(h.service);
    const res = await ctrl.invoke(
      "send_selfservice_link",
      { subscriberId: "ghost" as SubscriberId, kind: "billing" },
      "call_1",
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("not_verified");
  });

  it("알 수 없는 tool 이름 → { ok:false, unknown_tool }", async () => {
    const h = makeHarness();
    const ctrl = new ToolsController(h.service);
    const res = await ctrl.invoke("no_such_tool", {}, "call_1");
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("unknown_tool");
  });

  it("세션 헤더가 trace 로 이어진다", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    const ctrl = new ToolsController(h.service);
    const sid = "call_hdr" as CallSessionId;
    await ctrl.invoke("lookup_subscriber", { phone: sub.phone }, sid);
    expect(h.trace.entries[0]?.callSessionId).toBe(sid);
  });
});
