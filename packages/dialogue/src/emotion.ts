/**
 * 감정 태깅 유틸 (Worker B).
 *
 * 발화에서 angry/urgent 신호를 결정론적으로 감지하고,
 * 상담원(LLM)이 즉시 반영할 사과·속도조절·우선 인계 힌트를 만들어 준다.
 *
 * ⚠️ LLM 을 호출하지 않는다.
 */
import { EMOTIONS, type Emotion } from "@colli/contracts";

export interface EmotionTag {
  emotion: Emotion;
  /** 감정 감지 시 상담원이 반영할 짧은 지시(없으면 null). */
  hint: string | null;
  /** 우선 인계가 권장되는지(angry/urgent). */
  prioritize: boolean;
}

const ANGRY_KEYWORDS = [
  "화가",
  "화나",
  "짜증",
  "어이없",
  "황당",
  "불만",
  "최악",
  "너무하",
  "따지",
  "환불해",
  "책임져",
  "당장",
  "말이 돼",
  "됐고",
  "그만해",
] as const;

const URGENT_KEYWORDS = [
  "급해",
  "급합니다",
  "긴급",
  "지금 당장",
  "빨리",
  "당장 처리",
  "오늘 안에",
  "마감",
  "곧",
  "즉시",
  "asap",
  "urgent",
] as const;

const CONFUSED_KEYWORDS = [
  "모르겠",
  "헷갈",
  "이해가 안",
  "무슨 말",
  "어렵",
  "복잡",
] as const;

function includesAny(text: string, keywords: readonly string[]): boolean {
  return keywords.some((kw) => text.includes(kw.toLowerCase()));
}

const ANGRY_HINT =
  "고객이 화가 난 상태입니다. 먼저 진심으로 사과하고, 말 속도를 늦추며 공감하세요. 필요하면 우선 인계하세요.";
const URGENT_HINT =
  "고객이 급한 사안입니다. 우선순위를 높여 빠르게 사람 인계나 콜백으로 연결하세요.";
const CONFUSED_HINT =
  "고객이 혼란스러워합니다. 더 쉽고 천천히, 한 번에 하나씩 설명하세요.";

/**
 * 발화의 감정을 태깅한다.
 * 우선순위: angry > urgent > confused > neutral.
 * (분노가 감지되면 우선 인계가 가장 중요하므로 최상위.)
 */
export function tagEmotion(utterance: string): EmotionTag {
  const text = (utterance ?? "").toLowerCase();

  if (includesAny(text, ANGRY_KEYWORDS)) {
    return { emotion: "angry", hint: ANGRY_HINT, prioritize: true };
  }
  if (includesAny(text, URGENT_KEYWORDS)) {
    return { emotion: "urgent", hint: URGENT_HINT, prioritize: true };
  }
  if (includesAny(text, CONFUSED_KEYWORDS)) {
    return { emotion: "confused", hint: CONFUSED_HINT, prioritize: false };
  }
  return { emotion: "neutral", hint: null, prioritize: false };
}

/** EMOTIONS 상수 재노출 안전 확인용(계약 정합성). */
export const KNOWN_EMOTIONS: readonly Emotion[] = EMOTIONS;
