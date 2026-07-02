/**
 * 영업시간 판정/요약 순수 함수 (v3 사업장 커스텀).
 *
 * - `isWithinBusinessHours(hours, now)`: 지금이 영업시간 안인지 판정한다.
 *   타임존은 **Asia/Seoul 고정**(v1 계약 — BusinessDayHours 주석 참조).
 *   Asia/Seoul 은 UTC+9 고정 오프셋(DST 없음)이므로 순수 산술 변환으로 처리한다.
 * - `summarizeBusinessHours(hours)`: 프롬프트/UI 공용 한 줄 요약 문자열.
 *
 * ⚠️ 이 모듈은 I/O 가 없다. 판정 결과를 buildTenantSystemPrompt 의
 * `isAfterHours` 옵션으로 넘기는 것은 호출자(apps/voice·apps/api) 책임이다.
 *
 * 해석 규칙(계약 BusinessDayHours/BusinessHours 주석과 정렬):
 * - close ≤ open 이면 익일 마감(심야 영업). 예: 18:00~02:00 → 당일 18:00부터
 *   다음날 02:00 직전까지 영업. open 은 포함, close 는 미포함 경계.
 * - breakStart/breakEnd 구간은 영업 외(브레이크타임). breakStart 포함, breakEnd 미포함.
 * - holidayDates("YYYY-MM-DD")는 해당 **영업일 날짜** 기준 휴무 — 심야 영업의
 *   익일 새벽 구간은 영업이 시작된 날짜가 휴무일인지로 판정한다.
 * - closedOnPublicHolidays 는 공휴일 판정 데이터 연동이 로드맵이므로(v1 은 안내
 *   문구 반영만) 이 함수에서는 사용하지 않는다.
 * - hours 자체가 없으면(null/undefined) 24시간 응대로 간주해 항상 true.
 */
import {
  DAYS_OF_WEEK,
  DAY_OF_WEEK_LABELS,
  type BusinessDayHours,
  type BusinessHours,
  type DayOfWeek,
} from "@colli/contracts";

/** Asia/Seoul 은 UTC+9 고정(DST 없음) — 순수 함수 유지를 위해 산술 변환 사용. */
const KST_OFFSET_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
const DAY_MINUTES = 24 * 60;

/** Date.getUTCDay()(0=일) → DayOfWeek 키 매핑. */
const DAY_KEYS_BY_UTC_DAY: readonly DayOfWeek[] = [
  "sun",
  "mon",
  "tue",
  "wed",
  "thu",
  "fri",
  "sat",
];

/** "HH:mm" → 자정 기준 분(minute). */
function toMinutes(hhmm: string): number {
  const [h = 0, m = 0] = hhmm.split(":").map((part) => Number(part));
  return h * 60 + m;
}

function isoDateUtc(d: Date): string {
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, "0");
  const da = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${mo}-${da}`;
}

interface KstClock {
  /** 오늘(Asia/Seoul) 요일 키 */
  dayKey: DayOfWeek;
  /** 어제(Asia/Seoul) 요일 키 — 심야 영업(익일 마감) 꼬리 구간 판정용 */
  prevDayKey: DayOfWeek;
  /** 오늘 자정 기준 경과 분 */
  minutes: number;
  /** 오늘 날짜 "YYYY-MM-DD" */
  date: string;
  /** 어제 날짜 "YYYY-MM-DD" */
  prevDate: string;
}

/** UTC Date → Asia/Seoul 벽시계 값으로 변환. */
function toKstClock(now: Date): KstClock {
  const kst = new Date(now.getTime() + KST_OFFSET_MS);
  const prev = new Date(kst.getTime() - DAY_MS);
  return {
    dayKey: DAY_KEYS_BY_UTC_DAY[kst.getUTCDay()] as DayOfWeek,
    prevDayKey: DAY_KEYS_BY_UTC_DAY[prev.getUTCDay()] as DayOfWeek,
    minutes: kst.getUTCHours() * 60 + kst.getUTCMinutes(),
    date: isoDateUtc(kst),
    prevDate: isoDateUtc(prev),
  };
}

/**
 * 특정 영업일(dayKey, dateStr)의 영업 창(window) 안에 시각 t(분)가 들어가는지.
 * t 는 해당 영업일 자정 기준 경과 분 — 어제 창의 익일 새벽 구간을 판정할 때는
 * 호출자가 t 에 1440 을 더해 넘긴다.
 */
function isOpenInWindow(
  hours: BusinessHours,
  dayKey: DayOfWeek,
  dateStr: string,
  t: number,
): boolean {
  const day: BusinessDayHours | null = hours.days[dayKey] ?? null;
  if (!day) return false; // 정기 휴무
  if (hours.holidayDates?.includes(dateStr)) return false; // 임시 휴무일

  const open = toMinutes(day.open);
  let close = toMinutes(day.close);
  if (close <= open) close += DAY_MINUTES; // 익일 마감(심야 영업)

  if (t < open || t >= close) return false;

  // 브레이크타임(영업 외). 심야 창에서 자정 이후 브레이크도 open 기준으로 정규화.
  if (day.breakStart && day.breakEnd) {
    let bs = toMinutes(day.breakStart);
    let be = toMinutes(day.breakEnd);
    if (bs < open) bs += DAY_MINUTES;
    if (be <= bs) be += DAY_MINUTES;
    if (t >= bs && t < be) return false;
  }
  return true;
}

/**
 * 지금(now)이 영업시간 안인지 판정한다. Asia/Seoul 고정.
 *
 * - hours 가 null/undefined 면 24시간 응대로 간주해 항상 true(골든 패리티 —
 *   영업시간 미설정 사업장은 영업시간 분기 자체가 없다).
 * - 오늘 영업 창과, 어제 창의 심야(익일 마감) 꼬리 구간을 모두 검사한다.
 */
export function isWithinBusinessHours(
  hours: BusinessHours | null | undefined,
  now: Date,
): boolean {
  if (!hours) return true;
  const clock = toKstClock(now);
  // ① 오늘 영업일 창
  if (isOpenInWindow(hours, clock.dayKey, clock.date, clock.minutes)) return true;
  // ② 어제 영업일 창의 익일 새벽 구간(심야 영업)
  if (isOpenInWindow(hours, clock.prevDayKey, clock.prevDate, clock.minutes + DAY_MINUTES)) {
    return true;
  }
  return false;
}

function dayHoursText(day: BusinessDayHours): string {
  const base = `${day.open}~${day.close}`;
  if (day.breakStart && day.breakEnd) {
    return `${base}(브레이크 ${day.breakStart}~${day.breakEnd})`;
  }
  return base;
}

function segmentKey(day: BusinessDayHours | null): string {
  if (!day) return "closed";
  return `${day.open}|${day.close}|${day.breakStart ?? ""}|${day.breakEnd ?? ""}`;
}

function groupLabel(days: readonly DayOfWeek[]): string {
  const labels = days.map((d) => DAY_OF_WEEK_LABELS[d]);
  if (labels.length === 1) return labels[0] as string;
  if (labels.length === 2) return labels.join("·");
  return `${labels[0]}~${labels[labels.length - 1]}`;
}

/**
 * 요일별 영업시간을 사람이 읽는 한 줄 요약으로 만든다(프롬프트/UI 공용).
 * 동일 시간대의 연속 요일은 구간으로 묶는다.
 * 예: "월~금 09:00~18:00(브레이크 15:00~17:00), 토 10:00~14:00, 일 휴무"
 */
export function summarizeBusinessHours(hours: BusinessHours): string {
  const groups: Array<{ days: DayOfWeek[]; day: BusinessDayHours | null }> = [];
  for (const key of DAYS_OF_WEEK) {
    const day = hours.days[key] ?? null;
    const last = groups[groups.length - 1];
    if (last && segmentKey(last.day) === segmentKey(day)) {
      last.days.push(key);
    } else {
      groups.push({ days: [key], day });
    }
  }
  return groups
    .map((g) => `${groupLabel(g.days)} ${g.day ? dayHoursText(g.day) : "휴무"}`)
    .join(", ");
}
