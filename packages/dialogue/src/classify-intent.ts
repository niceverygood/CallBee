/**
 * 결정론적 의도 분류 (Worker B).
 *
 * 런타임에는 LLM 이 의도를 분류하지만, 여기서는 규칙 기반 폴백을 제공한다.
 * - 테스트 가능하고 재현 가능한 순수 함수.
 * - 키워드 가중치 스코어링 → 최고점 의도 선택. 동점/무매칭이면 'other'.
 *
 * ⚠️ LLM 을 호출하지 않는다.
 */
import { INTENTS, type Intent } from "@colli/contracts";

export interface IntentClassification {
  intent: Intent;
  /** 0~1. 규칙 매칭 강도(경쟁 의도 대비 우세도). */
  confidence: number;
}

/**
 * 의도별 키워드 사전.
 * - 한국어 구어체 문의를 가정한 부분 문자열 매칭(대소문자 무시).
 * - 'other' 는 폴백 전용이라 키워드가 없다.
 */
const KEYWORD_MAP: Record<Exclude<Intent, "other">, readonly string[]> = {
  usage: [
    "어떻게",
    "사용법",
    "사용 방법",
    "쓰는 법",
    "방법",
    "기능",
    "설정",
    "어디서",
    "어디에",
    "메뉴",
    "등록하는",
    "입력하는",
    "how",
  ],
  billing: [
    "결제",
    "청구",
    "요금",
    "카드",
    "환불",
    "영수증",
    "세금계산서",
    "인보이스",
    "결제수단",
    "billing",
    "payment",
    "invoice",
    "refund",
  ],
  tech_error: [
    "오류",
    "에러",
    "안 돼",
    "안돼",
    "안 됩니다",
    "먹통",
    "버그",
    "튕겨",
    "튕김",
    "느려",
    "로그인이 안",
    "접속이 안",
    "작동 안",
    "실행 안",
    "error",
    "bug",
    "crash",
    "안 열려",
  ],
  upgrade: [
    "업그레이드",
    "요금제 변경",
    "요금제 올",
    "플랜 변경",
    "플랜 올",
    "프로로",
    "상위 요금제",
    "구독 변경",
    "업글",
    "upgrade",
  ],
  churn: [
    "해지",
    "취소",
    "탈퇴",
    "구독 끊",
    "그만",
    "환불하고 해지",
    "더 이상 안 쓰",
    "안 쓸래",
    "cancel",
    "unsubscribe",
    "churn",
  ],
  new_signup: [
    "가입",
    "신규",
    "새로 시작",
    "처음 쓰",
    "계정 만",
    "회원가입",
    "등록하고 싶",
    "시작하고 싶",
    "signup",
    "sign up",
    "register",
    "new account",
  ],
};

/**
 * 특정 키워드가 다른 의도의 강한 신호에 눌려야 하는 경우를 위한 우선순위.
 * 숫자가 클수록, 동점일 때 우선 선택된다.
 * (예: "요금제 변경 해지 고민" → churn 과 upgrade 가 부딪히면 churn 을 약간 우선하지 않고,
 *  각 키워드 매칭 수로 결정하되, 동점 시 아래 순서를 tie-breaker 로 사용.)
 */
const TIE_BREAK_ORDER: Intent[] = [
  "churn",
  "upgrade",
  "new_signup",
  "tech_error",
  "billing",
  "usage",
  "other",
];

function countMatches(haystack: string, keywords: readonly string[]): number {
  let n = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw.toLowerCase())) n += 1;
  }
  return n;
}

/**
 * 발화를 7종 Intent 중 하나로 분류한다.
 * 무매칭이면 { intent: 'other', confidence: 0 }.
 */
export function classifyIntent(utterance: string): IntentClassification {
  const text = (utterance ?? "").toLowerCase().trim();
  if (text.length === 0) {
    return { intent: "other", confidence: 0 };
  }

  // 의도별 매칭 점수 집계
  const scores = new Map<Intent, number>();
  let total = 0;
  for (const intent of INTENTS) {
    if (intent === "other") continue;
    const kws = KEYWORD_MAP[intent as Exclude<Intent, "other">];
    const count = countMatches(text, kws);
    if (count > 0) {
      scores.set(intent, count);
      total += count;
    }
  }

  if (scores.size === 0 || total === 0) {
    return { intent: "other", confidence: 0 };
  }

  // 최고 점수 선택 (동점이면 TIE_BREAK_ORDER)
  let best: Intent = "other";
  let bestScore = 0;
  for (const intent of TIE_BREAK_ORDER) {
    const s = scores.get(intent) ?? 0;
    if (s > bestScore) {
      best = intent;
      bestScore = s;
    }
  }

  // confidence = 최고 의도 점수 비율. 단일 의도만 매칭되면 1.0 에 가깝다.
  const confidence = Math.min(1, bestScore / total);
  return { intent: best, confidence: Number(confidence.toFixed(3)) };
}
