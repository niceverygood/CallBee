/**
 * @colli/dialogue — 대화 정책 엔진 (Worker B).
 *
 * BoBi 상담 system prompt, 결정론적 의도 분류, 의도별 tool 라우팅/에스컬레이션,
 * 감정 태깅을 제공한다. 공유 타입/스키마/상수는 오직 @colli/contracts 에서 온다.
 *
 * 소비자:
 *  - Worker A (voice): buildSystemPrompt 로 세션 system 지시 주입.
 *  - Worker C (backend): decideAction 결과에 따라 tool 실행.
 */

// system prompt
export {
  buildSystemPrompt,
  buildEmotionHint,
  type SystemPromptOptions,
} from "./system-prompt.js";

// 의도 분류
export {
  classifyIntent,
  type IntentClassification,
} from "./classify-intent.js";

// 감정 태깅
export { tagEmotion, KNOWN_EMOTIONS, type EmotionTag } from "./emotion.js";

// tool 라우팅 / 에스컬레이션 정책
export {
  decideAction,
  DIALOGUE_ACTIONS,
  MAX_INTENT_ATTEMPTS,
  KB_CONFIDENCE_THRESHOLD,
  type DialogueAction,
  type DialogueState,
  type DialogueDecision,
} from "./decide-action.js";
