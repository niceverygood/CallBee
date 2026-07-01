/**
 * SessionHandler — 인바운드 통화 세션 오케스트레이션 (Worker A 핵심).
 *
 * 흐름(완료 기준 왕복):
 *   수신(call.initiated/ringing)
 *     → 응대(answer + AI/녹음 고지·동의 로깅 + 녹음 시작)   [GUARDRAIL #3]
 *     → Voice Agent 진행(인사 → 사용자 발화 전사 저장)
 *     → tool 1회 위임(ToolClient → Worker C) + trace 기록  [GUARDRAIL #2, #7]
 *     → 결과에 따라 warm transfer 또는 hang_up
 *   종료(call.ended) / 녹취(recording.completed) → 저장
 *
 * 모든 외부 의존은 포트/어댑터로만 접근한다(GUARDRAIL #6):
 *   ClawOpsAdapter · VoiceAgent · ToolClient · CallRepository.
 */
import type {
  ClawOpsEvent,
  ClawOpsCallId,
  CallSessionId,
  CallOutcome,
  SubscriberId,
  ToolName,
  ToolParams,
  ToolResult,
  EscalationTarget,
} from "@colli/contracts";
import { TOOL_SCHEMA_LIST } from "@colli/contracts";
import type { ClawOpsAdapter } from "../adapters/clawops-adapter.js";
import type {
  VoiceAgent,
  VoiceAgentSession,
} from "../adapters/voice-agent.js";
import { PLACEHOLDER_SYSTEM_PROMPT } from "../adapters/voice-agent.js";
import type { ToolClient } from "../ports/tool-client.js";
import type { CallRepository } from "../ports/call-repository.js";

// ── 고지 멘트(GUARDRAIL #3). 실제 문구는 Worker F/B 소유, 여기선 기본값. ──
export const AI_DISCLOSURE_TEXT =
  "안녕하세요. BoBi 고객센터 AI 상담원입니다. 상담 품질 향상을 위해 통화 내용이 녹음됩니다.";

export interface SessionHandlerDeps {
  clawops: ClawOpsAdapter;
  voiceAgent: VoiceAgent;
  toolClient: ToolClient;
  repo: CallRepository;
}

/** 진행 중 통화의 인메모리 상태 */
interface LiveCall {
  clawopsCallId: ClawOpsCallId;
  sessionId: CallSessionId;
  agentSession: VoiceAgentSession;
  outcome: CallOutcome | null;
}

/** tool 결과 → 통화 결과(CallOutcome) 매핑 */
function outcomeForTool(tool: ToolName): CallOutcome {
  switch (tool) {
    case "get_kb_answer":
      return "kb_answered";
    case "create_ticket":
      return "ticket_created";
    case "route_to_sales":
    case "escalate_to_human":
      return "transferred";
    case "request_callback":
      return "callback_queued";
    case "send_selfservice_link":
      return "selfservice_sent";
    default:
      return "other";
  }
}

/** tool 파라미터에서 인계 대상 유추(warm transfer 라우팅용) */
function transferTargetForTool(
  tool: ToolName,
  params: ToolParams<ToolName>,
): EscalationTarget {
  if (tool === "route_to_sales") return "sales";
  if (tool === "escalate_to_human") {
    const p = params as ToolParams<"escalate_to_human">;
    return p.target;
  }
  return "cs";
}

export class SessionHandler {
  private readonly deps: SessionHandlerDeps;
  private readonly live = new Map<ClawOpsCallId, LiveCall>();

  constructor(deps: SessionHandlerDeps) {
    this.deps = deps;
  }

  /** /voice 웹훅이 파싱한 이벤트를 이리로 넘긴다 */
  async handleEvent(event: ClawOpsEvent): Promise<void> {
    switch (event.type) {
      case "call.initiated":
        return this.onInitiated(event);
      case "call.ringing":
        return; // 관측만 — 상태 전이 없음
      case "call.answered":
        return this.onAnswered(event);
      case "call.ended":
        return this.onEnded(event);
      case "recording.completed":
        return this.onRecordingCompleted(event);
    }
  }

  // ── 수신: 세션 생성 + 응답 ──────────────────────────────────────
  private async onInitiated(
    event: Extract<ClawOpsEvent, { type: "call.initiated" }>,
  ): Promise<void> {
    const session = await this.deps.repo.createCallSession({
      clawopsCallId: event.callId,
      direction: event.payload.direction,
      fromNumber: event.from,
      toNumber: event.to,
      startedAt: event.timestamp,
    });

    const agentSession = this.deps.voiceAgent.createSession({
      systemPrompt: PLACEHOLDER_SYSTEM_PROMPT,
      tools: TOOL_SCHEMA_LIST,
      mode: this.deps.voiceAgent.mode,
    });

    this.live.set(event.callId, {
      clawopsCallId: event.callId,
      sessionId: session.id,
      agentSession,
      outcome: null,
    });

    await this.deps.clawops.answer(event.callId);
  }

  // ── 응대: 고지·동의 → 녹음 → 에이전트 진행 → tool → 종결 ───────
  private async onAnswered(
    event: Extract<ClawOpsEvent, { type: "call.answered" }>,
  ): Promise<void> {
    const call = this.live.get(event.callId);
    if (!call) return;

    // 1) AI + 녹음 고지 재생 및 동의 로깅 (GUARDRAIL #3)
    await this.deps.clawops.playPrompt(event.callId, AI_DISCLOSURE_TEXT);
    await this.deps.repo.recordConsent({
      callSessionId: call.sessionId,
      kind: "ai_disclosure",
      granted: true,
      disclosureText: AI_DISCLOSURE_TEXT,
    });
    await this.deps.repo.recordConsent({
      callSessionId: call.sessionId,
      kind: "recording",
      granted: true,
      disclosureText: AI_DISCLOSURE_TEXT,
    });
    await this.deps.repo.appendTranscript({
      callSessionId: call.sessionId,
      role: "system",
      text: AI_DISCLOSURE_TEXT,
    });

    // 2) 녹음 시작(동의 이후)
    if (this.deps.clawops.capabilities.recording) {
      await this.deps.clawops.startRecording(event.callId);
    }

    // 3) 에이전트 진행(수신→응대→tool 1회→종결)
    await this.driveAgent(call);
  }

  /** Voice Agent 이벤트 루프: 발화/사용자발화/tool호출/종결을 소비 */
  private async driveAgent(call: LiveCall): Promise<void> {
    const { agentSession } = call;
    let guard = 0;

    while (guard++ < 32) {
      const ev = await agentSession.next();
      if (ev === null) break;

      switch (ev.type) {
        case "speech":
          await this.deps.clawops.playPrompt(call.clawopsCallId, ev.text);
          await this.deps.repo.appendTranscript({
            callSessionId: call.sessionId,
            role: "agent",
            text: ev.text,
          });
          break;

        case "user_utterance":
          // barge-in: 사용자 발화가 들어오면 진행 중 TTS 중단
          if (this.deps.clawops.capabilities.bargeIn) {
            await this.deps.clawops.bargeIn(call.clawopsCallId);
          }
          await this.deps.repo.appendTranscript({
            callSessionId: call.sessionId,
            role: "caller",
            text: ev.text,
          });
          break;

        case "barge_in":
          if (this.deps.clawops.capabilities.bargeIn) {
            await this.deps.clawops.bargeIn(call.clawopsCallId);
          }
          break;

        case "tool_call":
          await this.runTool(call, ev.tool, ev.params);
          break;

        case "final":
          await this.finalize(call, ev.disposition);
          break;
      }
    }
  }

  /** tool 1회 위임(ToolClient → Worker C) + trace + 결과 주입 (GUARDRAIL #2, #7) */
  private async runTool(
    call: LiveCall,
    tool: ToolName,
    params: ToolParams<ToolName>,
  ): Promise<void> {
    const startedAt = Date.now();
    this.lastToolCall.set(call.clawopsCallId, { tool, params });
    const res = await this.deps.toolClient.invoke(tool, params);
    const latencyMs = Date.now() - startedAt;

    await this.deps.repo.recordToolInvocation({
      callSessionId: call.sessionId,
      toolName: tool,
      ok: res.ok,
      errorCode: res.ok ? undefined : res.error.code,
      latencyMs,
      paramsSummary: summarizeParams(tool, params),
    });

    if (res.ok) {
      // 본인확인 성공 시 세션에 subscriberId 반영
      if (tool === "lookup_subscriber" && res.data) {
        const profile = res.data as ToolResult<"lookup_subscriber">;
        if (profile) {
          await this.deps.repo.updateCallSession(call.sessionId, {
            subscriberId: profile.subscriberId as SubscriberId,
          });
        }
      }
      call.outcome = outcomeForTool(tool);
      await this.deps.repo.updateCallSession(call.sessionId, {
        outcome: call.outcome,
      });
      await call.agentSession.feedToolResult(tool, res.data);
    } else {
      // 실패는 관측성에 남기고 에이전트에 null 유형 결과를 주입하지 않음.
      call.outcome = "other";
      await this.deps.repo.updateCallSession(call.sessionId, {
        outcome: call.outcome,
        failureReason: `${tool}: ${res.error.code}`,
      });
    }
  }

  /** 종결: warm transfer 또는 hang_up */
  private async finalize(
    call: LiveCall,
    disposition: "hang_up" | "warm_transfer",
  ): Promise<void> {
    if (disposition === "warm_transfer") {
      // 마지막 tool 로부터 인계 대상 유추(없으면 cs)
      const lastTool = this.lastToolFor(call);
      const target: EscalationTarget = lastTool
        ? transferTargetForTool(lastTool.tool, lastTool.params)
        : "cs";
      if (this.deps.clawops.capabilities.warmTransfer) {
        await this.deps.clawops.warmTransfer(call.clawopsCallId, {
          target,
          whisperContext: "BoBi CS AI 인계",
        });
      }
      if (call.outcome === null) call.outcome = "transferred";
    } else {
      await this.deps.clawops.hangUp(call.clawopsCallId);
    }
  }

  // ── 종료/녹취 저장 ─────────────────────────────────────────────
  private async onEnded(
    event: Extract<ClawOpsEvent, { type: "call.ended" }>,
  ): Promise<void> {
    const call = this.live.get(event.callId);
    if (!call) return;
    await this.deps.repo.updateCallSession(call.sessionId, {
      endedAt: event.payload.endedAt,
      durationSec: event.payload.durationSec,
      outcome: call.outcome ?? "other",
    });
    await call.agentSession.close();
    this.live.delete(event.callId);
  }

  private async onRecordingCompleted(
    event: Extract<ClawOpsEvent, { type: "recording.completed" }>,
  ): Promise<void> {
    // 통화가 이미 정리됐을 수 있으므로 저장소에서 세션 조회.
    const record = await this.deps.repo.findByClawopsCallId(event.callId);
    if (!record) return;

    await this.deps.repo.saveRecording(
      record.id,
      event.payload.recordingUrl,
      event.payload.durationSec,
    );

    // 전사 텍스트가 함께 오면 저장(마스킹은 Worker F 소유; 여기선 그대로).
    if (event.payload.transcriptText) {
      await this.deps.repo.appendTranscript({
        callSessionId: record.id,
        role: "caller",
        text: event.payload.transcriptText,
      });
    }
  }

  // ── 내부 헬퍼 ──────────────────────────────────────────────────
  private lastToolCall = new Map<
    ClawOpsCallId,
    { tool: ToolName; params: ToolParams<ToolName> }
  >();

  private lastToolFor(
    call: LiveCall,
  ): { tool: ToolName; params: ToolParams<ToolName> } | undefined {
    return this.lastToolCall.get(call.clawopsCallId);
  }

  /** 테스트/디버그: 진행 중 통화 수 */
  get liveCount(): number {
    return this.live.size;
  }
}

/**
 * tool 파라미터 요약(관측성 저장용). PII/결제정보 최소화 (GUARDRAIL #1, #7).
 * 실제 마스킹 정책은 Worker F 소유 — 여기선 민감 키를 통째로 제거하는 보수적 기본값.
 */
const SENSITIVE_KEYS = new Set(["phone", "cardNumber", "cvc", "account"]);
function summarizeParams(
  tool: ToolName,
  params: ToolParams<ToolName>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { tool };
  for (const [k, v] of Object.entries(params as unknown as Record<string, unknown>)) {
    if (SENSITIVE_KEYS.has(k)) {
      out[k] = "[redacted]";
    } else if (typeof v === "string" && v.length > 80) {
      out[k] = `${v.slice(0, 77)}...`;
    } else {
      out[k] = v;
    }
  }
  return out;
}
