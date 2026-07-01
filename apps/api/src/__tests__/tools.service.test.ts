import { describe, it, expect } from "vitest";
import type {
  SubscriberId,
  CallSessionId,
  ToolName,
} from "@colli/contracts";
import { TOOL_NAMES } from "@colli/contracts";
import { ToolError } from "../tools.service.js";
import { makeHarness, makeSubscriber } from "./harness.js";

const CTX = { callSessionId: "call_1" as CallSessionId };

describe("ToolsService — 계약 시그니처대로 동작", () => {
  it("lookup_subscriber: 매칭 시 프로필, 미매칭 시 null(본인확인 실패)", async () => {
    const sub = makeSubscriber({ phone: "+821011112222" });
    const h = makeHarness({ subscribers: [sub] });

    const hit = await h.service.lookup_subscriber(
      { phone: "+821011112222" },
      CTX,
    );
    expect(hit).not.toBeNull();
    expect(hit?.subscriberId).toBe(sub.subscriberId);

    const miss = await h.service.lookup_subscriber(
      { phone: "+820000000000" },
      CTX,
    );
    expect(miss).toBeNull();
  });

  it("lookup_subscriber: 매칭 시 세션에 verified 기록(상태변경 tool 경유)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    await h.service.lookup_subscriber({ phone: sub.phone }, CTX);
    const state = await h.sessions.get(CTX.callSessionId);
    expect(state?.verified).toBe(true);
    expect(state?.subscriberId).toBe(sub.subscriberId);
  });

  it("get_kb_answer: 카테고리+키워드 매칭 → answer/sourceId/confidence", async () => {
    const h = makeHarness();
    const res = await h.service.get_kb_answer(
      { query: "고객 명단 관리 방법", category: "usage" },
      CTX,
    );
    expect(res.sourceId).not.toBeNull();
    expect(res.confidence).toBeGreaterThan(0);
    expect(res.answer).toContain("고객 관리");
  });

  it("get_kb_answer: 매칭 실패 → sourceId null + 폴백 문구(낮은 confidence)", async () => {
    const h = makeHarness();
    const res = await h.service.get_kb_answer(
      { query: "존재하지않는질문xyzzy" },
      CTX,
    );
    expect(res.sourceId).toBeNull();
    expect(res.confidence).toBeLessThan(0.34);
  });

  it("create_ticket: 티켓 생성 → ticketId/status=open", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    const res = await h.service.create_ticket(
      {
        subscriberId: sub.subscriberId,
        category: "tech_error",
        summary: "로그인 오류",
        severity: "high",
      },
      CTX,
    );
    expect(res.ticketId).toBeTruthy();
    expect(res.status).toBe("open");
    // 상태변경 확인: repo 에 실제 저장됨
    const stored = await h.tickets.findById(res.ticketId);
    expect(stored?.summary).toBe("로그인 오류");
  });

  it("create_ticket: 세션이 미확인 상태면 not_verified 로 차단(GUARDRAIL #4)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    // 본인확인 없이 세션에 다른 상태만 존재 → 게이트가 막아야 함
    await h.sessions.set(CTX.callSessionId, { verified: false });
    await expect(
      h.service.create_ticket(
        {
          subscriberId: sub.subscriberId,
          category: "tech_error",
          summary: "x",
          severity: "low",
        },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "not_verified" });
  });

  it("route_to_sales: churn → warm_transfer, 그 외 → callback_queued(+콜백 적재)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });

    const churn = await h.service.route_to_sales(
      { subscriberId: sub.subscriberId, reason: "churn", context: "해지 원함" },
      CTX,
    );
    expect(churn).toEqual({ routed: true, mode: "warm_transfer" });

    const upgrade = await h.service.route_to_sales(
      { subscriberId: sub.subscriberId, reason: "upgrade", context: "pro 검토" },
      CTX,
    );
    expect(upgrade.mode).toBe("callback_queued");
    const queued = await h.callbacks.list({ status: "queued" });
    expect(queued.length).toBe(1);
  });

  it("send_selfservice_link: 알림톡 위임 → sent/channel=alimtalk", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    const res = await h.service.send_selfservice_link(
      { subscriberId: sub.subscriberId, kind: "billing" },
      CTX,
    );
    expect(res).toEqual({ sent: true, channel: "alimtalk" });
    // Notifications 포트로 위임되어 발송 큐에 적재
    expect(h.notifications.sent.length).toBe(1);
    expect(h.notifications.sent[0]?.templateKey).toBe("selfservice_link");
  });

  it("send_selfservice_link: 미확인 subscriberId → not_verified 오류", async () => {
    const h = makeHarness();
    await expect(
      h.service.send_selfservice_link(
        { subscriberId: "ghost" as SubscriberId, kind: "billing" },
        CTX,
      ),
    ).rejects.toBeInstanceOf(ToolError);
  });

  it("request_callback: subscriberId 없이 phone 만으로 예약 가능", async () => {
    const h = makeHarness();
    const res = await h.service.request_callback(
      { phone: "+821099998888", summary: "다시 전화 요청", urgency: "high" },
      CTX,
    );
    expect(res.callbackId).toBeTruthy();
    const rec = await h.callbacks.findById(res.callbackId);
    expect(rec?.phone).toBe("+821099998888");
    expect(rec?.urgency).toBe("high");
  });

  it("request_callback: subscriberId/phone 둘 다 없으면 invalid_params", async () => {
    const h = makeHarness();
    await expect(
      h.service.request_callback(
        { summary: "요청", urgency: "normal" },
        CTX,
      ),
    ).rejects.toMatchObject({ code: "invalid_params" });
  });

  it("escalate_to_human: transferInitiated true + 세션 기록", async () => {
    const h = makeHarness();
    const res = await h.service.escalate_to_human(
      { reason: "보험상품 판단 요청(범위 밖)", target: "cs" },
      CTX,
    );
    expect(res.transferInitiated).toBe(true);
    const state = await h.sessions.get(CTX.callSessionId);
    expect(state?.escalatedTo).toBe("cs");
  });

  it("send_kakao_alimtalk: NotificationsPort 위임 → messageId/status", async () => {
    const h = makeHarness();
    h.notifications.forcedStatus = "sent";
    const res = await h.service.send_kakao_alimtalk(
      {
        templateKey: "cs_received",
        to: "+821012345678",
        vars: { name: "홍길동", receivedAt: new Date().toISOString() },
      },
      CTX,
    );
    expect(res.status).toBe("sent");
    expect(res.messageId).toBeTruthy();
    expect(h.notifications.sent.length).toBe(1);
  });
});

describe("핵심 경로: 본인확인 → 구독조회 → 티켓생성", () => {
  it("전 과정을 tool 만으로 통과하고 상태가 실제로 바뀐다", async () => {
    const sub = makeSubscriber({ phone: "+821055556666" });
    const h = makeHarness({ subscribers: [sub] });

    // 1) 본인확인
    const profile = await h.service.lookup_subscriber(
      { phone: "+821055556666" },
      CTX,
    );
    expect(profile).not.toBeNull();

    // 2) 구독조회(세션에 verified/subscriberId 기록됨)
    const session = await h.sessions.get(CTX.callSessionId);
    expect(session?.verified).toBe(true);
    expect(session?.subscriberId).toBe(sub.subscriberId);

    // 3) 티켓생성
    const ticket = await h.service.create_ticket(
      {
        subscriberId: profile!.subscriberId,
        category: "tech_error",
        summary: "동기화 실패",
        severity: "medium",
      },
      CTX,
    );
    expect(ticket.status).toBe("open");

    const stored = await h.tickets.list({ subscriberId: sub.subscriberId });
    expect(stored.length).toBe(1);
    expect(stored[0]?.summary).toBe("동기화 실패");
  });
});

describe("관측성: 모든 tool 호출에 trace 가 기록된다 (GUARDRAIL #7)", () => {
  it("성공 호출마다 trace 1건(ok=true, latency 기록)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });

    await h.service.lookup_subscriber({ phone: sub.phone }, CTX);
    await h.service.create_ticket(
      {
        subscriberId: sub.subscriberId,
        category: "usage",
        summary: "질문",
        severity: "low",
      },
      CTX,
    );

    expect(h.trace.entries.length).toBe(2);
    for (const e of h.trace.entries) {
      expect(e.ok).toBe(true);
      expect(e.callSessionId).toBe(CTX.callSessionId);
      expect(typeof e.latencyMs).toBe("number");
    }
    expect(h.trace.entries.map((e) => e.toolName)).toEqual([
      "lookup_subscriber",
      "create_ticket",
    ]);
  });

  it("실패 호출도 trace 에 남는다(ok=false + errorCode)", async () => {
    const h = makeHarness();
    await expect(
      h.service.request_callback({ summary: "x", urgency: "low" }, CTX),
    ).rejects.toBeInstanceOf(ToolError);
    expect(h.trace.entries.length).toBe(1);
    expect(h.trace.entries[0]?.ok).toBe(false);
    expect(h.trace.entries[0]?.errorCode).toBe("invalid_params");
  });

  it("trace 에 원문 phone 등 PII 를 남기지 않는다(마스킹)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });
    await h.service.lookup_subscriber({ phone: sub.phone }, CTX);
    const entry = h.trace.entries[0];
    expect(JSON.stringify(entry?.paramsSummary)).not.toContain(sub.phone);
  });
});

describe("dispatch: invoke(name) 가 8개 tool 을 모두 라우팅한다", () => {
  it("TOOL_NAMES 전부 invoke 로 호출 가능(계약 완전성)", async () => {
    const sub = makeSubscriber();
    const h = makeHarness({ subscribers: [sub] });

    const calls: Array<[ToolName, unknown]> = [
      ["lookup_subscriber", { phone: sub.phone }],
      ["get_kb_answer", { query: "고객 명단" }],
      [
        "create_ticket",
        {
          subscriberId: sub.subscriberId,
          category: "tech_error",
          summary: "x",
          severity: "low",
        },
      ],
      [
        "route_to_sales",
        { subscriberId: sub.subscriberId, reason: "upgrade", context: "c" },
      ],
      [
        "send_selfservice_link",
        { subscriberId: sub.subscriberId, kind: "billing" },
      ],
      ["request_callback", { phone: sub.phone, summary: "s", urgency: "low" }],
      ["escalate_to_human", { reason: "r", target: "cs" }],
      [
        "send_kakao_alimtalk",
        {
          templateKey: "cs_received",
          to: sub.phone,
          vars: { name: sub.name, receivedAt: new Date().toISOString() },
        },
      ],
    ];

    // 모든 tool 이름이 계약에 있고 invoke 가 처리한다.
    expect(calls.map((c) => c[0]).sort()).toEqual([...TOOL_NAMES].sort());
    for (const [name, params] of calls) {
      await expect(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        h.service.invoke(name, params as any, CTX),
      ).resolves.toBeDefined();
    }
  });

  it("알 수 없는 tool 이름 → ToolError(unknown_tool)", async () => {
    const h = makeHarness();
    await expect(
      // @ts-expect-error 계약에 없는 이름은 타입에서 막힘(런타임 방어 확인)
      h.service.invoke("no_such_tool", {}, CTX),
    ).rejects.toBeInstanceOf(ToolError);
  });
});
