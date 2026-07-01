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
