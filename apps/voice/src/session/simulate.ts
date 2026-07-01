/**
 * managed inbound 통화 시뮬레이션 헬퍼.
 * 실 인프라 없이 ClawOps 웹훅 이벤트 시퀀스를 생성해 SessionHandler 로 흘려보낸다.
 * 데모 스크립트와 vitest 테스트가 공유한다.
 */
import type {
  ClawOpsEvent,
  ClawOpsCallId,
  ToolName,
  ToolParams,
  ToolResult,
} from "@colli/contracts";
import { InMemoryClawOpsAdapter } from "../adapters/clawops-mock.js";
import { MockVoiceAgent, type MockScenario } from "../adapters/voice-agent-mock.js";
import { InMemoryToolClient, type ToolHandlers } from "../ports/tool-client-mock.js";
import { InMemoryCallRepository } from "../ports/call-repository-mock.js";
import { SessionHandler } from "./session-handler.js";
import type { VoiceAgentMode } from "@colli/contracts";

export interface SimulationOptions {
  callId?: string;
  from?: string;
  to?: string;
  mode?: VoiceAgentMode;
  scenario: MockScenario;
  toolHandlers: ToolHandlers;
  /** recording.completed 에 실려오는 전사(옵션) */
  transcriptText?: string;
}

export interface SimulationResult {
  clawops: InMemoryClawOpsAdapter;
  toolClient: InMemoryToolClient;
  repo: InMemoryCallRepository;
  handler: SessionHandler;
  callId: ClawOpsCallId;
}

/** call.initiated → ringing → answered → ended → recording.completed 시퀀스 */
export function buildInboundEventSequence(opts: {
  callId: ClawOpsCallId;
  from: string;
  to: string;
  recordingUrl: string;
  transcriptText?: string;
}): ClawOpsEvent[] {
  const { callId, from, to, recordingUrl, transcriptText } = opts;
  const t0 = "2026-07-01T09:00:00.000Z";
  return [
    {
      type: "call.initiated",
      callId,
      from,
      to,
      timestamp: t0,
      payload: { direction: "inbound" },
    },
    {
      type: "call.ringing",
      callId,
      from,
      to,
      timestamp: "2026-07-01T09:00:01.000Z",
      payload: { ringingAt: "2026-07-01T09:00:01.000Z" },
    },
    {
      type: "call.answered",
      callId,
      from,
      to,
      timestamp: "2026-07-01T09:00:03.000Z",
      payload: { answeredAt: "2026-07-01T09:00:03.000Z" },
    },
    {
      type: "call.ended",
      callId,
      from,
      to,
      timestamp: "2026-07-01T09:01:30.000Z",
      payload: {
        endedAt: "2026-07-01T09:01:30.000Z",
        durationSec: 87,
        reason: "completed",
      },
    },
    {
      type: "recording.completed",
      callId,
      from,
      to,
      timestamp: "2026-07-01T09:01:35.000Z",
      payload: {
        recordingUrl,
        durationSec: 87,
        ...(transcriptText ? { transcriptText } : {}),
      },
    },
  ];
}

/** 전체 managed inbound 통화를 시뮬레이션하고 목 상태를 돌려준다 */
export async function simulateInboundCall(
  opts: SimulationOptions,
): Promise<SimulationResult> {
  const callId = (opts.callId ?? "clawops_call_demo_1") as ClawOpsCallId;
  const from = opts.from ?? "+821012345678";
  const to = opts.to ?? "+827012340000";
  const mode: VoiceAgentMode = opts.mode ?? "realtime";

  const clawops = new InMemoryClawOpsAdapter();
  const voiceAgent = new MockVoiceAgent(mode, opts.scenario);
  const toolClient = new InMemoryToolClient(opts.toolHandlers);
  const repo = new InMemoryCallRepository();

  const handler = new SessionHandler({ clawops, voiceAgent, toolClient, repo });

  const events = buildInboundEventSequence({
    callId,
    from,
    to,
    recordingUrl: "https://recordings.example/clawops_call_demo_1.wav",
    transcriptText: opts.transcriptText,
  });

  for (const ev of events) {
    await handler.handleEvent(ev);
  }

  return { clawops, toolClient, repo, handler, callId };
}

// ── 재사용 가능한 기본 시나리오들 ───────────────────────────────

/** KB 답변 후 통화 종료(hang_up) 시나리오 */
export function kbAnswerScenario(): MockScenario {
  return {
    greeting: "무엇을 도와드릴까요?",
    userUtterance: "리포트 내보내기가 어디 있나요?",
    tool: "get_kb_answer",
    params: {
      query: "리포트 내보내기 위치",
      category: "usage",
    } satisfies ToolParams<"get_kb_answer">,
    closingLine: (result) => {
      const r = result as ToolResult<"get_kb_answer">;
      return `안내드리겠습니다. ${r.answer}`;
    },
    disposition: "hang_up",
  };
}

/** 해지 문의 → 영업 인계(warm transfer) 시나리오 */
export function salesTransferScenario(subscriberId: string): MockScenario {
  return {
    greeting: "무엇을 도와드릴까요?",
    userUtterance: "구독을 해지하고 싶어요.",
    tool: "route_to_sales",
    params: {
      subscriberId: subscriberId as ToolParams<"route_to_sales">["subscriberId"],
      reason: "churn",
      context: "해지 요청 — 리텐션 인계",
    },
    closingLine: () => "담당 상담사에게 연결해드리겠습니다.",
    disposition: "warm_transfer",
  };
}

/** 사용 가능한 tool 목록 확인용(디버그) */
export const KNOWN_TOOLS: readonly ToolName[] = [
  "lookup_subscriber",
  "get_kb_answer",
  "create_ticket",
  "route_to_sales",
  "send_selfservice_link",
  "request_callback",
  "escalate_to_human",
  "send_kakao_alimtalk",
];
