import { describe, it, expect } from "vitest";
import type {
  SubscriberProfile,
  SubscriberId,
  ToolResult,
} from "@colli/contracts";
import {
  simulateInboundCall,
  kbAnswerScenario,
  salesTransferScenario,
} from "./simulate.js";
import type { ToolHandlers } from "../ports/tool-client-mock.js";

const SUBSCRIBER: SubscriberProfile = {
  subscriberId: "sub_123" as SubscriberId,
  name: "홍길동",
  phone: "+821012345678",
  tier: "pro",
  status: "active",
  billingState: "current",
};

describe("SessionHandler — managed inbound 왕복", () => {
  it("수신→응대→tool 1회→hang_up 왕복 + 녹음/전사/동의/trace 저장 (realtime)", async () => {
    const kbHandlers: ToolHandlers = {
      get_kb_answer: (): ToolResult<"get_kb_answer"> => ({
        answer: "설정 > 리포트 > 내보내기에서 가능합니다.",
        sourceId: null,
        confidence: 0.92,
      }),
    };

    const { clawops, toolClient, repo } = await simulateInboundCall({
      mode: "realtime",
      scenario: kbAnswerScenario(),
      toolHandlers: kbHandlers,
      transcriptText: "리포트 내보내기가 어디 있나요?",
    });

    // (1) 흐름: answer → 고지 → 녹음 시작 → 발화들 → hang_up
    const kinds = clawops.actions.map((a) => a.kind);
    expect(kinds[0]).toBe("answer");
    expect(kinds).toContain("startRecording");
    expect(kinds).toContain("bargeIn"); // 사용자 발화에 barge-in
    expect(kinds).toContain("hangUp");
    expect(kinds).not.toContain("warmTransfer");
    // answer 는 hangUp 보다 앞
    expect(kinds.indexOf("answer")).toBeLessThan(kinds.indexOf("hangUp"));

    // (1) tool 정확히 1회 위임
    expect(toolClient.invocations).toHaveLength(1);
    expect(toolClient.invocations[0]?.tool).toBe("get_kb_answer");

    // (2) 저장 포트 호출: 녹음
    expect(repo.recordings).toHaveLength(1);
    expect(repo.recordings[0]?.recordingUrl).toContain(".wav");
    expect(repo.recordings[0]?.durationSec).toBe(87);

    // (2) 저장 포트 호출: 전사(고지 system + agent + caller + recording transcript)
    const roles = repo.transcripts.map((t) => t.role);
    expect(roles).toContain("system"); // 고지
    expect(roles).toContain("agent"); // 응대 발화
    expect(roles).toContain("caller"); // 사용자 발화
    expect(repo.transcripts.length).toBeGreaterThanOrEqual(3);

    // (2) 동의 기록: ai_disclosure + recording (GUARDRAIL #3)
    const consentKinds = repo.consents.map((c) => c.kind);
    expect(consentKinds).toContain("ai_disclosure");
    expect(consentKinds).toContain("recording");
    expect(repo.consents.every((c) => c.granted)).toBe(true);

    // (2) tool trace 기록 (GUARDRAIL #7)
    expect(repo.toolInvocations).toHaveLength(1);
    expect(repo.toolInvocations[0]?.toolName).toBe("get_kb_answer");
    expect(repo.toolInvocations[0]?.ok).toBe(true);

    // 결과: kb_answered, 종료 저장됨
    const session = [...repo.sessions.values()][0];
    expect(session?.outcome).toBe("kb_answered");

    // 진행 중 통화 정리됨(call.ended 후)
    // (liveCount 는 SimulationResult.handler 로 접근)
  });

  it("해지 문의 → route_to_sales → warm_transfer 왕복 (pipeline 모드)", async () => {
    const salesHandlers: ToolHandlers = {
      lookup_subscriber: (): ToolResult<"lookup_subscriber"> => SUBSCRIBER,
      route_to_sales: (): ToolResult<"route_to_sales"> => ({
        routed: true,
        mode: "warm_transfer",
      }),
    };

    const { clawops, toolClient, repo } = await simulateInboundCall({
      mode: "pipeline",
      scenario: salesTransferScenario("sub_123"),
      toolHandlers: salesHandlers,
    });

    const kinds = clawops.actions.map((a) => a.kind);
    // warm transfer 로 종결, hang_up 아님
    expect(kinds).toContain("warmTransfer");
    expect(kinds).not.toContain("hangUp");

    // warm transfer 대상은 sales
    const wt = clawops.actionsOfKind("warmTransfer")[0];
    expect(wt?.opts.target).toBe("sales");

    // tool 1회(route_to_sales)
    expect(toolClient.invocations).toHaveLength(1);
    expect(toolClient.invocations[0]?.tool).toBe("route_to_sales");

    // 결과 transferred + 녹음 저장
    const session = [...repo.sessions.values()][0];
    expect(session?.outcome).toBe("transferred");
    expect(repo.recordings).toHaveLength(1);
  });

  it("call.ended 후 통화 상태가 정리된다(liveCount=0)", async () => {
    const { handler } = await simulateInboundCall({
      scenario: kbAnswerScenario(),
      toolHandlers: {
        get_kb_answer: (): ToolResult<"get_kb_answer"> => ({
          answer: "ok",
          sourceId: null,
          confidence: 0.8,
        }),
      },
    });
    expect(handler.liveCount).toBe(0);
  });

  it("본인확인(lookup_subscriber) 성공 시 세션에 subscriberId 반영", async () => {
    // lookup 을 tool 로 쓰는 시나리오
    const { repo } = await simulateInboundCall({
      scenario: {
        greeting: "본인확인을 도와드리겠습니다.",
        userUtterance: "제 번호는 010-1234-5678이에요.",
        tool: "lookup_subscriber",
        params: { phone: "+821012345678" },
        closingLine: (result) => {
          const r = result as ToolResult<"lookup_subscriber">;
          return r ? `${r.name}님 확인되었습니다.` : "확인이 어렵습니다.";
        },
        disposition: "hang_up",
      },
      toolHandlers: {
        lookup_subscriber: (): ToolResult<"lookup_subscriber"> => SUBSCRIBER,
      },
    });

    const session = [...repo.sessions.values()][0];
    expect(session?.subscriberId).toBe("sub_123");
  });

  it("tool 실패 시 trace 에 error 기록되고 outcome=other", async () => {
    const { repo, toolClient } = await simulateInboundCall({
      scenario: kbAnswerScenario(),
      toolHandlers: {
        // 핸들러 미등록 → NO_HANDLER 실패 유도 (get_kb_answer 만 빼둠)
      },
    });

    expect(toolClient.invocations).toHaveLength(1);
    expect(repo.toolInvocations[0]?.ok).toBe(false);
    expect(repo.toolInvocations[0]?.errorCode).toBe("NO_HANDLER");
    const session = [...repo.sessions.values()][0];
    expect(session?.outcome).toBe("other");
  });
});
