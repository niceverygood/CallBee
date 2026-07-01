/**
 * VoiceAgent 어댑터 — Realtime|Pipeline 교체 가능한 음성 에이전트 (GUARDRAIL #6).
 *
 * 세션에 다음을 바인딩한다:
 *   - Worker B 의 system prompt (여기선 placeholder 문자열 주입 지점)
 *   - `TOOL_SCHEMA_LIST` (계약의 tool function-calling 스키마)
 *
 * 실 SDK(OpenAI Realtime 등)는 없으므로 인터페이스 + 목으로 대체한다.
 * 에이전트는 tool 을 직접 실행하지 않는다 — tool 호출 "의도"만 방출하고,
 * 실행은 세션 핸들러가 ToolClient(→ Worker C)로 위임한다.
 */
import type {
  RuntimeToolSchema,
  ToolName,
  ToolParams,
  ToolResult,
  VoiceAgentMode,
} from "@colli/contracts";
import { TOOL_SCHEMA_LIST } from "@colli/contracts";

/** 에이전트가 방출하는 이벤트(핸들러가 소비) */
export type VoiceAgentEvent =
  | { type: "speech"; role: "agent"; text: string }
  | { type: "user_utterance"; text: string }
  | {
      type: "tool_call";
      tool: ToolName;
      params: ToolParams<ToolName>;
    }
  | { type: "barge_in" }
  | {
      type: "final";
      /** 대화 종결 방식 힌트 (핸들러가 transfer/hangup 결정) */
      disposition: "hang_up" | "warm_transfer";
    };

export interface VoiceAgentSessionConfig {
  /**
   * 세션에 바인딩할 system prompt. v1 에서는 Worker B 소유 placeholder 고정값을
   * 그대로 썼으나, v2(멀티테넌트)부터는 세션 핸들러가 070 조회 결과
   * (`ResolvedTenantAgentContext`)로 조립한 테넌트별 문자열을 넘긴다.
   */
  systemPrompt: string;
  /**
   * 세션에 바인딩할 tool 스키마 배열. v1 고정 `TOOL_SCHEMA_LIST` 또는
   * v2 `RuntimeToolSchema[]`(시스템 tool ∪ 테넌트 커스텀 tool 병합 결과,
   * @colli/contracts 의 `ResolvedTenantAgentContext.toolSchemas`) 모두 허용한다.
   * 로컬 재정의 금지 → contracts 에서만.
   */
  tools: typeof TOOL_SCHEMA_LIST | RuntimeToolSchema[];
  mode: VoiceAgentMode;
}

/** 세션 핸들러가 에이전트에 tool 결과를 되돌려주기 위한 콜백 */
export type ToolResultFeed = <T extends ToolName>(
  tool: T,
  result: ToolResult<T>,
) => Promise<void>;

/**
 * 하나의 통화에 붙는 에이전트 세션.
 * `next()` 를 폴링하면 에이전트가 다음 이벤트(발화/tool호출/종결)를 방출한다.
 */
export interface VoiceAgentSession {
  readonly mode: VoiceAgentMode;
  /** 다음 에이전트 이벤트. null 이면 세션 종료(더 방출할 게 없음). */
  next(): Promise<VoiceAgentEvent | null>;
  /** tool 실행 결과를 에이전트에 주입(다음 턴 생성에 반영) */
  feedToolResult: ToolResultFeed;
  /** 사용자 발화 유입(전사) */
  pushUserUtterance(text: string): void;
  close(): Promise<void>;
}

export interface VoiceAgent {
  readonly mode: VoiceAgentMode;
  createSession(config: VoiceAgentSessionConfig): VoiceAgentSession;
}

/** Worker B 의 실제 프롬프트가 오기 전까지 쓰는 placeholder */
export const PLACEHOLDER_SYSTEM_PROMPT =
  "[[WORKER_B_SYSTEM_PROMPT]] 친절·간결한 BoBi 고객센터 AI. 한 번에 한 질문. 이름/번호/날짜 복창. 결제정보 음성수집 금지.";
