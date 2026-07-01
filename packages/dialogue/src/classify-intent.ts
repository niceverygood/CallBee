/**
 * 결정론적 의도 분류 (Worker B → dialogue 일반화).
 *
 * 런타임에는 LLM 이 의도를 분류하지만, 여기서는 규칙 기반 폴백을 제공한다.
 * - 테스트 가능하고 재현 가능한 순수 함수.
 * - 키워드 가중치 스코어링 → 최고점 의도 선택. 동점/무매칭이면 'other'.
 *
 * ⚠️ LLM 을 호출하지 않는다.
 *
 * `classifyIntent(utterance, catalog?)` — `catalog` 를 생략하면 기존 BoBi
 * 하드코드 `KEYWORD_MAP`(7종) 폴백 로직 그대로 실행한다(하위호환, 기존
 * classify-intent.test.ts 16개 무수정 통과). `catalog`(TenantIntentDefinition[])를
 * 넘기면 각 항목의 `keywords` 로 동일 스코어링 알고리즘(countMatches, 동점 처리
 * 규칙)을 재사용해 테넌트 자유 의도 카탈로그를 분류한다.
 */
import {
  INTENTS,
  INTENT_LABELS,
  type Intent,
  type TenantIntentDefinition,
  type TenantIntentKey,
} from "@colli/contracts";

export interface IntentClassification {
  intent: Intent;
  /** 0~1. 규칙 매칭 강도(경쟁 의도 대비 우세도). */
  confidence: number;
}

/** catalog 지정 시 반환되는 일반화 분류 결과. key 는 TenantIntentKey(문자열). */
export interface TenantIntentClassification {
  key: TenantIntentKey;
  /** 0~1. 규칙 매칭 강도(경쟁 의도 대비 우세도). */
  confidence: number;
}

/**
 * 의도별 키워드 사전.
 * - 한국어 구어체 문의를 가정한 부분 문자열 매칭(대소문자 무시).
 * - 'other' 는 폴백 전용이라 키워드가 없다.
 *
 * seed 스크립트(docs/tenant-platform-architecture.md §4.3)가 BoBi 테넌트의
 * TenantIntent.keywords 를 채울 때 이 상수를 그대로 재사용할 수 있도록 export 한다.
 */
export const KEYWORD_MAP: Record<Exclude<Intent, "other">, readonly string[]> = {
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
 * 발화를 7종 Intent 중 하나로 분류한다(BoBi 고정 KEYWORD_MAP 폴백).
 * 무매칭이면 { intent: 'other', confidence: 0 }.
 */
function classifyIntentBobi(text: string): IntentClassification {
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

/**
 * 발화를 테넌트 자유 의도 카탈로그(catalog) 중 하나로 분류한다.
 * BoBi 고정 로직과 동일한 스코어링 알고리즘(countMatches, 동점 처리)을 재사용하되,
 * 동점 tie-break 는 catalog 의 sortOrder 순서를 따른다(먼저 등장한 의도 우선).
 * 무매칭이면 폴백 의도(catalog 에 'other'/'기타' 성격의 항목이 없다면 첫 매칭
 * 실패 항목 없이 confidence 0 의 첫 카탈로그 항목)로 처리하지 않고, 별도의
 * "무매칭" 표시를 위해 confidence 0 과 함께 catalog 순서상 가장 낮은 sortOrder
 * 의 폴백 후보를 반환한다 — 구체적으로는 매칭이 전혀 없으면 key 는 catalog 중
 * enabled 인 항목 중 sortOrder 가 가장 큰(=목록 마지막, 관례상 'other'/'기타')
 * 항목을 반환한다. catalog 가 비어 있으면 예외를 던진다.
 */
function classifyIntentWithCatalog(
  text: string,
  catalog: readonly TenantIntentDefinition[],
): TenantIntentClassification {
  const enabled = catalog.filter((i) => i.enabled);
  if (enabled.length === 0) {
    throw new Error("classifyIntent: catalog 에 활성화된 TenantIntentDefinition 이 없습니다.");
  }
  const sorted = [...enabled].sort((a, b) => a.sortOrder - b.sortOrder);
  const fallback = sorted[sorted.length - 1]!;

  const scores = new Map<TenantIntentKey, number>();
  let total = 0;
  for (const def of sorted) {
    const count = countMatches(text, def.keywords);
    if (count > 0) {
      scores.set(def.key, count);
      total += count;
    }
  }

  if (scores.size === 0 || total === 0) {
    return { key: fallback.key, confidence: 0 };
  }

  // 최고 점수 선택 (동점이면 catalog 등장 순서, 즉 sortOrder 순서상 먼저 나온 항목 우선)
  let best: TenantIntentKey = fallback.key;
  let bestScore = 0;
  for (const def of sorted) {
    const s = scores.get(def.key) ?? 0;
    if (s > bestScore) {
      best = def.key;
      bestScore = s;
    }
  }

  const confidence = Math.min(1, bestScore / total);
  return { key: best, confidence: Number(confidence.toFixed(3)) };
}

/**
 * 발화를 의도로 분류한다.
 *
 * - `catalog` 미지정: 기존 BoBi 하드코드 `KEYWORD_MAP`(7종) 폴백. 반환 타입은
 *   `IntentClassification`(intent: Intent) — 하위호환.
 * - `catalog` 지정: `TenantIntentDefinition[]` 를 기반으로 분류. 반환 타입은
 *   `TenantIntentClassification`(key: TenantIntentKey).
 */
export function classifyIntent(utterance: string): IntentClassification;
export function classifyIntent(
  utterance: string,
  catalog: readonly TenantIntentDefinition[],
): TenantIntentClassification;
export function classifyIntent(
  utterance: string,
  catalog?: readonly TenantIntentDefinition[],
): IntentClassification | TenantIntentClassification {
  const text = (utterance ?? "").toLowerCase().trim();

  if (catalog !== undefined) {
    if (text.length === 0) {
      const enabled = catalog.filter((i) => i.enabled);
      if (enabled.length === 0) {
        throw new Error("classifyIntent: catalog 에 활성화된 TenantIntentDefinition 이 없습니다.");
      }
      const sorted = [...enabled].sort((a, b) => a.sortOrder - b.sortOrder);
      return { key: sorted[sorted.length - 1]!.key, confidence: 0 };
    }
    return classifyIntentWithCatalog(text, catalog);
  }

  if (text.length === 0) {
    return { intent: "other", confidence: 0 };
  }
  return classifyIntentBobi(text);
}

// ── BoBi(테넌트 #1) 기본 의도 카탈로그 ───────────────────────────
/**
 * `INTENTS`/`INTENT_LABELS`/`KEYWORD_MAP` 을 그대로 이식한 BoBi 기본
 * `TenantIntentDefinition[]`. `docs/tenant-platform-architecture.md` §4.3
 * 시드값(routingToolName/sortOrder 포함)과 정렬된다.
 *
 * `buildTenantSystemPrompt`/`classifyIntent(utterance, catalog)`/
 * `decideGenericAction` 을 "BoBi 디폴트 테넌트" 기준으로 하위호환 검증할 때
 * 이 카탈로그를 재사용한다.
 */
const BOBI_ROUTING_TOOL: Record<Intent, string | null> = {
  usage: "get_kb_answer",
  billing: "send_selfservice_link",
  tech_error: "create_ticket",
  upgrade: "route_to_sales",
  churn: "route_to_sales",
  new_signup: "route_to_sales",
  other: null,
};

export const BOBI_DEFAULT_TENANT_INTENTS: TenantIntentDefinition[] = INTENTS.map(
  (intent, index) => ({
    key: intent as unknown as TenantIntentKey,
    label: INTENT_LABELS[intent],
    keywords: intent === "other" ? [] : [...KEYWORD_MAP[intent as Exclude<Intent, "other">]],
    routingToolName: BOBI_ROUTING_TOOL[intent],
    sortOrder: index,
    enabled: true,
  }),
);
