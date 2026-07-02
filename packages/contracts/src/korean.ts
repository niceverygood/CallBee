/**
 * 한국어 조사 선택 유틸 — 마지막 글자의 받침 유무로 이형태 조사를 고른다.
 *
 * 용도: 업종 팩 등 템플릿 문구의 "{업체명}은(는)" 류 플레이스홀더를 상호명에
 * 맞는 자연스러운 조사로 치환한다(음성 응대라 "은(는)" 병기를 TTS 가 그대로
 * 읽어버리는 문제 방지).
 *
 * 판정 규칙:
 * - 한글 음절(가~힣): 유니코드 분해로 받침 유무 판정.
 * - 숫자(0~9): 한국어 독음 기준(영·일·삼·육·칠·팔 받침 있음 / 이·사·오·구 없음).
 * - 그 외(영문 등)로 끝나면 판정 불가 → 병기형("은(는)")을 그대로 쓴다.
 */

/** 마지막 유효 문자의 받침 유무. 판정 불가면 null. */
export function hasFinalConsonant(word: string): boolean | null {
  const trimmed = word.trim();
  if (!trimmed) return null;
  const ch = trimmed[trimmed.length - 1]!;
  const code = ch.charCodeAt(0);

  // 한글 음절: (code - 0xAC00) % 28 → 0 이면 받침 없음
  if (code >= 0xac00 && code <= 0xd7a3) {
    return (code - 0xac00) % 28 !== 0;
  }
  // 숫자: 독음 기준(0영 1일 2이 3삼 4사 5오 6육 7칠 8팔 9구)
  if (ch >= "0" && ch <= "9") {
    return ["0", "1", "3", "6", "7", "8"].includes(ch);
  }
  return null;
}

export type JosaPair = "은/는" | "이/가" | "을/를" | "과/와";

const JOSA_TABLE: Record<JosaPair, { withBatchim: string; withoutBatchim: string; ambiguous: string }> = {
  "은/는": { withBatchim: "은", withoutBatchim: "는", ambiguous: "은(는)" },
  "이/가": { withBatchim: "이", withoutBatchim: "가", ambiguous: "이(가)" },
  "을/를": { withBatchim: "을", withoutBatchim: "를", ambiguous: "을(를)" },
  "과/와": { withBatchim: "과", withoutBatchim: "와", ambiguous: "과(와)" },
};

/** 단어에 맞는 조사만 반환. 예: josa("윤정 파스타", "은/는") → "는" */
export function josa(word: string, pair: JosaPair): string {
  const entry = JOSA_TABLE[pair];
  const batchim = hasFinalConsonant(word);
  if (batchim === null) return entry.ambiguous;
  return batchim ? entry.withBatchim : entry.withoutBatchim;
}

/** 단어+조사 결합. 예: withJosa("윤정 파스타", "은/는") → "윤정 파스타는" */
export function withJosa(word: string, pair: JosaPair): string {
  return `${word}${josa(word, pair)}`;
}
