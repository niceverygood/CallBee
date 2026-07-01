/**
 * MockVoiceAgent — VoiceAgent 의 목 구현 (realtime|pipeline 공통).
 *
 * 실 SDK 없이 결정적(deterministic) 스크립트로 하나의 통화를 진행한다:
 *   1) 인사(고지는 세션 핸들러가 별도로 처리)
 *   2) 사용자 발화 수신
 *   3) tool 1회 호출(핸들러가 ToolClient 로 위임) → 결과 주입 대기
 *   4) 결과에 따라 hang_up 또는 warm_transfer 로 종결
 *
 * 스크립트는 생성 시 주입해 다양한 시나리오(의도별)를 테스트할 수 있다.
 */
import type {
  ToolName,
  ToolParams,
  ToolResult,
  VoiceAgentMode,
} from "@colli/contracts";
import type {
  VoiceAgent,
  VoiceAgentEvent,
  VoiceAgentSession,
  VoiceAgentSessionConfig,
} from "./voice-agent.js";

/** 목 시나리오 정의: 한 번의 tool 호출과 종결 방식 */
export interface MockScenario {
  greeting: string;
  /** 초기 사용자 발화(전사로 유입될 문장) */
  userUtterance: string;
  /** 호출할 tool 1개 */
  tool: ToolName;
  params: ToolParams<ToolName>;
  /** tool 결과를 받은 뒤 방출할 마무리 발화 */
  closingLine: (result: ToolResult<ToolName>) => string;
  /** 마무리 종결 방식 */
  disposition: "hang_up" | "warm_transfer";
}

class MockVoiceAgentSession implements VoiceAgentSession {
  readonly mode: VoiceAgentMode;
  private readonly scenario: MockScenario;
  private step = 0;
  private lastToolResult: ToolResult<ToolName> | null = null;

  constructor(mode: VoiceAgentMode, scenario: MockScenario) {
    this.mode = mode;
    this.scenario = scenario;
  }

  async next(): Promise<VoiceAgentEvent | null> {
    const s = this.scenario;
    switch (this.step) {
      case 0:
        this.step++;
        return { type: "speech", role: "agent", text: s.greeting };
      case 1:
        this.step++;
        return { type: "user_utterance", text: s.userUtterance };
      case 2:
        this.step++;
        return { type: "tool_call", tool: s.tool, params: s.params };
      case 3:
        // tool 결과가 주입될 때까지 대기(핸들러가 feedToolResult 후 next 재호출)
        if (this.lastToolResult === null) return null;
        this.step++;
        return {
          type: "speech",
          role: "agent",
          text: s.closingLine(this.lastToolResult),
        };
      case 4:
        this.step++;
        return { type: "final", disposition: s.disposition };
      default:
        return null;
    }
  }

  async feedToolResult<T extends ToolName>(
    _tool: T,
    result: ToolResult<T>,
  ): Promise<void> {
    this.lastToolResult = result as ToolResult<ToolName>;
  }

  pushUserUtterance(_text: string): void {
    // 목에서는 스크립트가 발화를 소유하므로 no-op.
  }

  async close(): Promise<void> {
    this.lastToolResult = null;
  }
}

export class MockVoiceAgent implements VoiceAgent {
  readonly mode: VoiceAgentMode;
  private readonly scenario: MockScenario;

  constructor(mode: VoiceAgentMode, scenario: MockScenario) {
    this.mode = mode;
    this.scenario = scenario;
  }

  createSession(config: VoiceAgentSessionConfig): VoiceAgentSession {
    // config.mode 를 존중하되, 어댑터 자체 mode 와 일치해야 함.
    return new MockVoiceAgentSession(config.mode, this.scenario);
  }
}
