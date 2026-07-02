/**
 * isWithinBusinessHours / summarizeBusinessHours 경계 케이스 테스트.
 *
 * 기준 주간: 2026-07-06(월) ~ 2026-07-12(일). Asia/Seoul(UTC+9) 고정.
 */
import { describe, it, expect } from "vitest";
import type { BusinessHours } from "@colli/contracts";
import { isWithinBusinessHours, summarizeBusinessHours } from "./business-hours.js";

/** "YYYY-MM-DDTHH:mm" (Asia/Seoul 벽시계) → Date */
function kst(local: string): Date {
  return new Date(`${local}:00+09:00`);
}

const HOURS: BusinessHours = {
  days: {
    mon: { open: "09:00", close: "18:00", breakStart: "15:00", breakEnd: "17:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "18:00", close: "02:00" }, // 심야 영업(익일 마감)
    sat: { open: "10:00", close: "14:00" },
    sun: null, // 정기 휴무
  },
  holidayDates: ["2026-07-07"], // 화요일 임시 휴무
  note: "매월 마지막 주 월요일은 정기 휴무입니다",
};

describe("isWithinBusinessHours — 기본 판정", () => {
  it("영업시간 안(월 10:00)이면 true", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T10:00"))).toBe(true);
  });

  it("open 경계는 포함(월 09:00 true), 직전은 미포함(08:59 false)", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T09:00"))).toBe(true);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T08:59"))).toBe(false);
  });

  it("close 경계는 미포함(월 18:00 false), 직전은 포함(17:59 true)", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T18:00"))).toBe(false);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T17:59"))).toBe(true);
  });

  it("정기 휴무 요일(일)은 항상 false", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-12T12:00"))).toBe(false);
  });

  it("hours 가 null/undefined 면 24시간 응대로 간주(항상 true)", () => {
    expect(isWithinBusinessHours(null, kst("2026-07-12T03:00"))).toBe(true);
    expect(isWithinBusinessHours(undefined, kst("2026-07-12T03:00"))).toBe(true);
  });
});

describe("isWithinBusinessHours — 브레이크타임", () => {
  it("브레이크타임(월 15:00~17:00) 구간은 영업 외", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T15:00"))).toBe(false);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T16:30"))).toBe(false);
  });

  it("브레이크 종료(17:00)부터 다시 영업, 시작 직전(14:59)까지 영업", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T17:00"))).toBe(true);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-06T14:59"))).toBe(true);
  });

  it("브레이크 없는 요일(수)은 같은 시각에 영업 중", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-08T16:00"))).toBe(true);
  });
});

describe("isWithinBusinessHours — 자정 걸침(심야 영업, close<open)", () => {
  it("금 18:00~익일 02:00: 금 23:30 은 영업 중", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-10T23:30"))).toBe(true);
  });

  it("토 01:30(금요일 창의 익일 새벽 꼬리)은 영업 중", () => {
    // 토요일 자체 창(10:00~14:00)은 아직 아니지만 금요일 심야 창에 포함된다.
    expect(isWithinBusinessHours(HOURS, kst("2026-07-11T01:30"))).toBe(true);
  });

  it("토 02:00(마감 경계)부터는 영업 외, 토 10:00 부터 토요일 창으로 재개", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-11T02:00"))).toBe(false);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-11T02:30"))).toBe(false);
    expect(isWithinBusinessHours(HOURS, kst("2026-07-11T10:00"))).toBe(true);
  });

  it("금 17:59(심야 창 open 직전)는 영업 외", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-10T17:59"))).toBe(false);
  });

  it("요일 경계: 일요일 새벽 00:30 은 토요일 창(10:00~14:00)이 당일 마감이므로 영업 외", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-12T00:30"))).toBe(false);
  });
});

describe("isWithinBusinessHours — 임시 휴무일(holidayDates)", () => {
  it("휴무일(화 2026-07-07)은 영업시간대여도 false", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-07T10:00"))).toBe(false);
  });

  it("같은 요일이라도 휴무일이 아닌 주(화 2026-07-14)는 영업 중", () => {
    expect(isWithinBusinessHours(HOURS, kst("2026-07-14T10:00"))).toBe(true);
  });

  it("심야 영업일이 휴무면 익일 새벽 꼬리 구간도 휴무", () => {
    const withFridayHoliday: BusinessHours = { ...HOURS, holidayDates: ["2026-07-10"] };
    expect(isWithinBusinessHours(withFridayHoliday, kst("2026-07-10T23:00"))).toBe(false);
    expect(isWithinBusinessHours(withFridayHoliday, kst("2026-07-11T01:00"))).toBe(false);
    // 다음 주 금요일은 정상 영업.
    expect(isWithinBusinessHours(withFridayHoliday, kst("2026-07-17T23:00"))).toBe(true);
  });
});

describe("isWithinBusinessHours — Asia/Seoul 고정(UTC 입력 변환)", () => {
  it("UTC 인스턴트를 KST 벽시계로 판정한다", () => {
    // 2026-07-06T01:00Z = 월 10:00 KST → 영업 중
    expect(isWithinBusinessHours(HOURS, new Date("2026-07-06T01:00:00Z"))).toBe(true);
    // 2026-07-05T23:00Z = 월 08:00 KST → 영업 전
    expect(isWithinBusinessHours(HOURS, new Date("2026-07-05T23:00:00Z"))).toBe(false);
    // 2026-07-05T09:00Z = 일 18:00 KST → 정기 휴무
    expect(isWithinBusinessHours(HOURS, new Date("2026-07-05T09:00:00Z"))).toBe(false);
  });
});

describe("summarizeBusinessHours", () => {
  it("동일 시간대 연속 요일을 구간으로 묶고 휴무 요일을 명시한다", () => {
    const simple: BusinessHours = {
      days: {
        mon: { open: "09:00", close: "18:00" },
        tue: { open: "09:00", close: "18:00" },
        wed: { open: "09:00", close: "18:00" },
        thu: { open: "09:00", close: "18:00" },
        fri: { open: "09:00", close: "18:00" },
        sat: { open: "10:00", close: "14:00" },
        sun: null,
      },
    };
    expect(summarizeBusinessHours(simple)).toBe("월~금 09:00~18:00, 토 10:00~14:00, 일 휴무");
  });

  it("브레이크타임이 있으면 요약에 포함되고, 시간대가 다르면 구간이 분리된다", () => {
    const s = summarizeBusinessHours(HOURS);
    expect(s).toContain("월 09:00~18:00(브레이크 15:00~17:00)");
    expect(s).toContain("화~목 09:00~18:00");
    expect(s).toContain("금 18:00~02:00");
    expect(s).toContain("토 10:00~14:00");
    expect(s).toContain("일 휴무");
  });

  it("연속 2일 구간은 가운뎃점으로 잇는다", () => {
    const twoDays: BusinessHours = {
      days: {
        mon: { open: "09:00", close: "18:00" },
        tue: { open: "09:00", close: "18:00" },
        wed: null,
        thu: null,
        fri: null,
        sat: null,
        sun: null,
      },
    };
    expect(summarizeBusinessHours(twoDays)).toBe("월·화 09:00~18:00, 수~일 휴무");
  });
});
