export function formatDateTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** 쉼표로 구분된 문자열 ↔ 배열 변환(간단 폼 필드용) */
export function parseCsv(value: string): string[] {
  return value
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toCsv(values: string[]): string {
  return values.join(", ");
}

/** 줄바꿈으로 구분된 문자열 ↔ 배열 변환(문단형 목록 입력용) */
export function parseLines(value: string): string[] {
  return value
    .split("\n")
    .map((s) => s.trim())
    .filter(Boolean);
}

export function toLines(values: string[]): string {
  return values.join("\n");
}

/**
 * 발신번호 마스킹 — 통화 기록 목록 표기(product-spec §4.9): 010-****-5678.
 * 하이픈 유무와 무관하게 가운데 자리(마지막 4자리 앞 4자리)를 가린다.
 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/[^\d]/g, "");
  if (digits.length < 8) return phone;
  const tail = digits.slice(-4);
  const head = digits.slice(0, digits.length - 8);
  return `${head || digits.slice(0, 3)}-****-${tail}`;
}

/** 통화 시간(초) → "1분 23초" / "45초" */
export function formatDuration(sec: number): string {
  if (!Number.isFinite(sec) || sec <= 0) return "0초";
  const m = Math.floor(sec / 60);
  const s = Math.round(sec % 60);
  if (m === 0) return `${s}초`;
  return s === 0 ? `${m}분` : `${m}분 ${s}초`;
}

/** 문자(SMS) 안내 문구 바이트 수(EUC-KR 근사: 한글 2바이트) — 90바이트 카운터용 */
export function smsByteLength(text: string): number {
  let bytes = 0;
  for (const ch of text) {
    bytes += ch.charCodeAt(0) > 127 ? 2 : 1;
  }
  return bytes;
}
