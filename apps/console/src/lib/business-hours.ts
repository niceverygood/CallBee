/**
 * 영업시간 판정·요약 헬퍼 (콘솔 미리보기 전용 — "지금 전화가 오면?" 패널).
 *
 * 실제 통화 분기 판정은 packages/dialogue 의 isWithinBusinessHours 가 담당한다.
 * 콘솔은 dialogue 를 의존하지 않으므로(공유 타입은 @colli/contracts 만) 같은
 * 규칙(product-spec §4.3)을 UI 미리보기용으로 가볍게 재구현한다:
 * - close < open 이면 익일 마감(심야 영업)으로 해석
 * - breakStart~breakEnd 구간은 영업 외
 * - holidayDates("YYYY-MM-DD")는 휴무
 * - 요일 null = 정기 휴무, businessHours 자체가 null = 24시간 응대
 * v1 타임존은 Asia/Seoul 고정 — 미리보기는 브라우저 로컬 시각을 그대로 쓴다
 * (국내 사장님 콘솔 전제).
 */
import type { BusinessDayHours, BusinessHours, DayOfWeek } from "@colli/contracts";
import { DAYS_OF_WEEK, DAY_OF_WEEK_LABELS } from "@colli/contracts";

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

function dayOfWeekOf(date: Date): DayOfWeek {
  // getDay(): 0=일 … 6=토 → DAYS_OF_WEEK 는 mon 시작
  const map: DayOfWeek[] = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[date.getDay()] ?? "mon";
}

function isoDateOf(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function withinDay(hours: BusinessDayHours, minutes: number): boolean {
  const open = toMinutes(hours.open);
  const close = toMinutes(hours.close);
  const inOpenRange =
    close > open
      ? minutes >= open && minutes < close
      : minutes >= open || minutes < close; // 심야 영업(익일 마감)
  if (!inOpenRange) return false;
  if (hours.breakStart && hours.breakEnd) {
    const bs = toMinutes(hours.breakStart);
    const be = toMinutes(hours.breakEnd);
    if (minutes >= bs && minutes < be) return false;
  }
  return true;
}

/** now 시점이 영업시간 내인지 판정. businessHours 가 null 이면 항상 true(24시간). */
export function isWithinBusinessHoursPreview(
  businessHours: BusinessHours | null | undefined,
  now: Date = new Date(),
): boolean {
  if (!businessHours) return true;
  if (businessHours.holidayDates?.includes(isoDateOf(now))) return false;

  const minutes = now.getHours() * 60 + now.getMinutes();
  const today = dayOfWeekOf(now);
  const todayHours = businessHours.days[today];
  if (todayHours && withinDay(todayHours, minutes)) return true;

  // 전날 심야 영업(익일 마감)이 아직 이어지는 경우
  const prevIdx = (DAYS_OF_WEEK.indexOf(today) + 6) % 7;
  const prev = businessHours.days[DAYS_OF_WEEK[prevIdx]!];
  if (prev && toMinutes(prev.close) < toMinutes(prev.open)) {
    if (minutes < toMinutes(prev.close)) return true;
  }
  return false;
}

/** 요일별 영업시간 한 줄 요약(대시보드/미리보기 공용). */
export function summarizeBusinessHoursPreview(businessHours: BusinessHours): string {
  const parts: string[] = [];
  for (const day of DAYS_OF_WEEK) {
    const h = businessHours.days[day];
    parts.push(
      h ? `${DAY_OF_WEEK_LABELS[day]} ${h.open}~${h.close}` : `${DAY_OF_WEEK_LABELS[day]} 휴무`,
    );
  }
  return parts.join(" · ");
}

/** 영업시간 외 기본 안내 멘트(mode 별 템플릿 — product-spec §4.3). */
export function defaultAfterHoursText(
  mode: "callback" | "announce_hours",
  serviceName: string,
): string {
  if (mode === "callback") {
    return `지금은 ${serviceName} 영업시간이 아닙니다. 성함과 연락처를 남겨주시면 영업시간에 바로 연락드리겠습니다.`;
  }
  return `지금은 ${serviceName} 영업시간이 아닙니다. 영업시간은 안내된 시간과 같습니다. 영업시간에 다시 전화해 주세요.`;
}
