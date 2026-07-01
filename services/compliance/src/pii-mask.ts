/**
 * PII 마스킹 (GUARDRAIL #1: 결제정보 음성수집·복창·저장 금지).
 *
 * 전사/대화/로그로 흘러가는 모든 텍스트는 저장·기록 전에 반드시 `maskPII` 를 통과해야 한다.
 * 카드번호·계좌번호·CVC 패턴(한국 포맷 포함)을 탐지해 마스킹한다.
 *
 * 정책:
 * - 오탐(false positive)보다 미탐(false negative)이 훨씬 위험하다 → 넓게 잡는다.
 * - 마스킹된 텍스트만 Transcript/ToolInvocation/로그에 남긴다.
 */

/** 마스킹에 쓰는 치환 토큰 */
export const PII_MASK = {
  card: "[CARD]",
  account: "[ACCOUNT]",
  cvc: "[CVC]",
} as const;

/** 탐지된 PII 종류 */
export type PiiKind = "card" | "account" | "cvc";

export interface PiiMatch {
  kind: PiiKind;
  /** 원문에서 매칭된 문자열(로그에는 남기지 말 것 — 디버깅/테스트용) */
  value: string;
}

export interface MaskPiiResult {
  /** 마스킹이 적용된 안전한 텍스트 */
  masked: string;
  /** 탐지된 PII 목록 */
  found: PiiMatch[];
}

// 구분자: 공백, 하이픈, 점 (한국어 음성 전사에서 흔한 형태)
const SEP = "[\\s\\-.]?";

/**
 * 카드번호. 두 형태만 카드로 인정해 계좌(불규칙 하이픈 그룹)와 구분한다:
 *  (a) 균일 그룹형: 4-4-4-4 / 4-4-4-3 (공백·하이픈·점 구분) → Visa/Master/Amex/Diners
 *  (b) 구분자 없는 연속 13~16자리.
 * 국내 계좌는 3-3-6, 4-2-7 처럼 그룹 자리수가 불규칙하므로 (a)에 안 걸리고 계좌 규칙으로 넘어간다.
 */
const CARD_GROUPED_RE = new RegExp(
  `\\b\\d{4}${SEP}\\d{4}${SEP}\\d{4}${SEP}\\d{3,4}\\b`,
  "g",
);
const CARD_PLAIN_RE = new RegExp(`\\b\\d{13,16}\\b`, "g");

/**
 * CVC/CVV: 3~4자리. 맥락 키워드(cvc/cvv/보안코드/시큐리티) 근처의 3~4자리만 마스킹.
 * (일반 3~4자리 숫자를 무차별 마스킹하면 오탐이 과도하므로 맥락 요구.)
 */
const CVC_RE = new RegExp(
  `(cvc|cvv|시큐리티\\s*코드|보안\\s*코드)([^\\d]{0,6})(\\d{3,4})\\b`,
  "gi",
);

/**
 * 국내 계좌번호: 은행 계좌는 보통 10~14자리, 구분자(-)로 나뉜 3~4개 그룹.
 * 예) 110-123-456789, 3333-01-1234567. 하이픈 포함 그룹 형태를 잡는다.
 */
const ACCOUNT_HYPHEN_RE = new RegExp(
  `\\b\\d{2,6}-\\d{2,6}-\\d{2,7}(?:-\\d{1,6})?\\b`,
  "g",
);

/**
 * 계좌번호(구분자 없는 연속): 10~12자리 연속 숫자.
 * (구분자 없는 13~16자리는 카드로 먼저 처리하므로 여기선 10~12자리만.)
 */
const ACCOUNT_PLAIN_RE = new RegExp(`\\b\\d{10,12}\\b`, "g");

/** 매칭 문자열에서 숫자 개수만 센다(구분자 무시). */
function digitCount(s: string): number {
  let n = 0;
  for (const ch of s) if (ch >= "0" && ch <= "9") n += 1;
  return n;
}

/**
 * 전사/대화/로그 텍스트에서 결제정보(카드/계좌/CVC)를 탐지·마스킹한다.
 * 저장·로그 전에 반드시 통과시킨다.
 */
export function maskPII(text: string): MaskPiiResult {
  if (!text) return { masked: text, found: [] };

  const found: PiiMatch[] = [];
  let out = text;

  // 1) CVC (맥락 키워드 기반) — 카드/계좌보다 먼저: 3~4자리라 뒤 규칙에 안 먹힘
  out = out.replace(CVC_RE, (_m, kw: string, gap: string, digits: string) => {
    found.push({ kind: "cvc", value: digits });
    return `${kw}${gap}${PII_MASK.cvc}`;
  });

  // 2) 카드번호 — 균일 그룹형(4-4-4-4)
  out = out.replace(CARD_GROUPED_RE, (m) => {
    found.push({ kind: "card", value: m });
    return PII_MASK.card;
  });

  // 3) 계좌번호 (하이픈 불규칙 그룹형) — 숫자 8자리 이상. 카드(4-4-4-4) 이후 처리.
  out = out.replace(ACCOUNT_HYPHEN_RE, (m) => {
    if (digitCount(m) < 8) return m;
    found.push({ kind: "account", value: m });
    return PII_MASK.account;
  });

  // 4) 카드번호 — 구분자 없는 연속 13~16자리
  out = out.replace(CARD_PLAIN_RE, (m) => {
    found.push({ kind: "card", value: m });
    return PII_MASK.card;
  });

  // 5) 계좌번호 — 구분자 없는 연속 10~12자리(카드 처리 후 남은 것)
  out = out.replace(ACCOUNT_PLAIN_RE, (m) => {
    found.push({ kind: "account", value: m });
    return PII_MASK.account;
  });

  return { masked: out, found };
}

/** 텍스트에 결제정보가 포함되었는지 여부만 빠르게 판단(저장 차단 게이트용). */
export function containsPaymentPII(text: string): boolean {
  return maskPII(text).found.length > 0;
}
