/**
 * 테넌트 일반화 라우팅 — "의도 1건당 tool 1개 직결" 모델 (dialogue 일반화).
 *
 * `decideAction`(decide-action.ts, BoBi 전용 12개 분기: 감정 연동, 보험조언
 * 우선순위, kbLowConfidence 폴백 등)은 그대로 유지하고 수정하지 않는다.
 * 신규 테넌트를 위한 범용 라우팅은 훨씬 단순한 모델만 지원한다:
 *
 * - `state.intent` 로 `intents` 배열에서 매칭되는 `TenantIntentDefinition` 을 찾는다.
 * - `routingToolName` 이 있으면 그 tool 을 호출하는 액션을 반환한다.
 * - `routingToolName` 이 없으면 `get_kb_answer` 폴백을 반환한다.
 * - 매칭 실패(카탈로그에 없는 intent) 또는 반복 실패(intentAttempts 가
 *   `agentConfig.maxIntentAttempts` 이상)면 `agentConfig.intentUnresolvedFallbackTool`
 *   (기본 request_callback) 호출 액션을 반환한다.
 *
 * `docs/tenant-platform-architecture.md` §0, §3.3 명시: decideAction 의 12개
 * 분기를 재현하지 않는다 — 이번 범위는 "의도 1건당 tool 1개 직결"까지만 지원한다.
 *
 * ⚠️ LLM 을 호출하지 않는다.
 */
import type { TenantAgentConfig, TenantIntentDefinition, TenantIntentKey } from "@colli/contracts";

/** decideGenericAction 이 반환하는 상위 행동 유형 (관측성/분기용). */
export const GENERIC_DIALOGUE_ACTIONS = [
  "route_to_intent_tool",
  "answer_from_kb",
  "unresolved_fallback",
  "reask",
] as const;
export type GenericDialogueAction = (typeof GENERIC_DIALOGUE_ACTIONS)[number];

/** decideGenericAction 입력 상태. */
export interface GenericDialogueState {
  /** 현재 파악된 의도 key. 아직 파악 못 했으면 null. */
  intent: TenantIntentKey | string | null;
  /** 지금까지 의도 파악을 시도한 횟수(되물음 포함). */
  intentAttempts?: number;
}

/** decideGenericAction 결과. */
export interface GenericDialogueDecision {
  /** 호출할 tool 이름. 되물음 등 tool 이 필요 없으면 null. */
  tool: string | null;
  /** 상위 행동 유형. */
  action: GenericDialogueAction;
  /** 결정 사유(로그/trace용, 한국어). */
  reason: string;
  /** 매칭된 TenantIntentDefinition(있으면). */
  matchedIntent: TenantIntentDefinition | null;
}

/**
 * 대화 상태 → 다음 행동 결정 (순수 함수). "의도 1건당 tool 1개 직결" 모델.
 */
export function decideGenericAction(
  state: GenericDialogueState,
  intents: readonly TenantIntentDefinition[],
  agentConfig: Pick<TenantAgentConfig, "intentUnresolvedFallbackTool" | "maxIntentAttempts">,
): GenericDialogueDecision {
  const attempts = state.intentAttempts ?? 0;
  const maxAttempts = agentConfig.maxIntentAttempts;
  const fallbackTool = agentConfig.intentUnresolvedFallbackTool;

  // 반복 실패(임계 초과) → 폴백 tool.
  if (attempts >= maxAttempts && (state.intent === null || !findIntent(state.intent, intents))) {
    return {
      tool: fallbackTool,
      action: "unresolved_fallback",
      reason: `의도 파악을 ${attempts}회 시도했으나 실패하여 폴백 tool(${fallbackTool})을 호출한다(무한 루프 방지).`,
      matchedIntent: null,
    };
  }

  // 아직 의도가 없고 임계 미만이면 한 번 더 되묻는다(tool 없음).
  if (state.intent === null) {
    return {
      tool: null,
      action: "reask",
      reason: "의도가 아직 파악되지 않아 한 번 더 되물어 명확히 한다.",
      matchedIntent: null,
    };
  }

  const matched = findIntent(state.intent, intents);

  // 매칭 실패(카탈로그에 없는 intent) → 폴백 tool.
  if (!matched) {
    return {
      tool: fallbackTool,
      action: "unresolved_fallback",
      reason: `의도(${state.intent})가 카탈로그에 매칭되지 않아 폴백 tool(${fallbackTool})을 호출한다.`,
      matchedIntent: null,
    };
  }

  // routingToolName 이 있으면 그 tool 을 직결한다.
  if (matched.routingToolName) {
    return {
      tool: matched.routingToolName,
      action: "route_to_intent_tool",
      reason: `${matched.key}(${matched.label}) 의도 → 지정된 tool(${matched.routingToolName})을 호출한다.`,
      matchedIntent: matched,
    };
  }

  // routingToolName 없으면 get_kb_answer 기본 폴백.
  return {
    tool: "get_kb_answer",
    action: "answer_from_kb",
    reason: `${matched.key}(${matched.label}) 의도에 지정된 tool 이 없어 기본 폴백(get_kb_answer)으로 답변을 시도한다.`,
    matchedIntent: matched,
  };
}

function findIntent(
  key: string,
  intents: readonly TenantIntentDefinition[],
): TenantIntentDefinition | null {
  return intents.find((i) => i.enabled && i.key === key) ?? null;
}
