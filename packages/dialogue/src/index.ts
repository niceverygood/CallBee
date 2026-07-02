/**
 * @colli/dialogue — 대화 정책 엔진 (Worker B → dialogue 일반화).
 *
 * BoBi 상담 system prompt, 결정론적 의도 분류, 의도별 tool 라우팅/에스컬레이션,
 * 감정 태깅을 제공한다. 공유 타입/스키마/상수는 오직 @colli/contracts 에서 온다.
 *
 * v2(멀티테넌트) 확장: `buildTenantSystemPrompt`/`classifyIntent(utterance, catalog)`/
 * `decideGenericAction` 이 `TenantAgentConfig`/`TenantIntentDefinition[]` 을
 * 받아 테넌트별로 동작한다. 기존 BoBi 전용 함수(`buildSystemPrompt`/
 * `classifyIntent(utterance)`/`decideAction`)는 시그니처·로직 변경 없이 그대로
 * 유지된다(하위호환).
 *
 * 소비자:
 *  - Worker A (voice): buildSystemPrompt/buildTenantSystemPrompt 로 세션 system 지시 주입.
 *  - Worker C (backend): decideAction/decideGenericAction 결과에 따라 tool 실행.
 */

// system prompt
export {
  buildSystemPrompt,
  buildTenantSystemPrompt,
  buildEmotionHint,
  BOBI_DEFAULT_AGENT_CONFIG,
  type SystemPromptOptions,
  type TenantSystemPromptContext,
} from "./system-prompt.js";

// 영업시간 판정/요약 (v3 사업장 커스텀 — Asia/Seoul 고정 순수 함수)
export { isWithinBusinessHours, summarizeBusinessHours } from "./business-hours.js";

// 의도 분류
export {
  classifyIntent,
  KEYWORD_MAP,
  BOBI_DEFAULT_TENANT_INTENTS,
  type IntentClassification,
  type TenantIntentClassification,
} from "./classify-intent.js";

// 감정 태깅
export { tagEmotion, KNOWN_EMOTIONS, type EmotionTag } from "./emotion.js";

// tool 라우팅 / 에스컬레이션 정책 (BoBi 전용, 12개 분기 — 무변경)
export {
  decideAction,
  DIALOGUE_ACTIONS,
  MAX_INTENT_ATTEMPTS,
  KB_CONFIDENCE_THRESHOLD,
  type DialogueAction,
  type DialogueState,
  type DialogueDecision,
} from "./decide-action.js";

// tool 라우팅 정책 (테넌트 일반화 — "의도 1건당 tool 1개 직결")
export {
  decideGenericAction,
  GENERIC_DIALOGUE_ACTIONS,
  type GenericDialogueAction,
  type GenericDialogueState,
  type GenericDialogueDecision,
} from "./decide-generic-action.js";
