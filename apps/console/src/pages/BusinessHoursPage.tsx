import { useState } from "react";
import type { AfterHoursMode, BusinessDayHours, BusinessHours, DayOfWeek } from "@colli/contracts";
import {
  AFTER_HOURS_MODES,
  AFTER_HOURS_MODE_LABELS,
  DAYS_OF_WEEK,
  DAY_OF_WEEK_LABELS,
} from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useAgentConfigDraft } from "../lib/agent-config-draft";
import {
  isWithinBusinessHoursPreview,
  defaultAfterHoursText,
} from "../lib/business-hours";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { Badge } from "../components/Badge";
import { ChipsInput } from "../components/ChipsInput";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 운영 설정 > 영업시간 — product-spec §4.3.
 * 요일 7행 그리드(토글+시간) + "평일 일괄 적용" + 임시 휴무일 + 공휴일 휴무 +
 * 비고 + 영업시간 외 응대 방식(라디오) + 안내 멘트, 우측 "지금 전화가 오면?"
 * 미리보기(현재 시각 판정 + 실제 나갈 멘트).
 */

const DEFAULT_DAY: BusinessDayHours = { open: "09:00", close: "18:00" };

function emptyDays(): Record<DayOfWeek, BusinessDayHours | null> {
  return { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null };
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function BusinessHoursPage() {
  const tenantId = useTenantId();
  const { isLoading, error, draft, patch, save, saving, saveError, savedAt } =
    useAgentConfigDraft(tenantId);
  const [breakOpenFor, setBreakOpenFor] = useState<Partial<Record<DayOfWeek, boolean>>>({});

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const hours = draft.businessHours ?? null;
  const enabled = hours !== null;

  const setHours = (next: BusinessHours | null) => patch({ businessHours: next });

  const toggleAll = (on: boolean) => {
    if (!on) {
      setHours(null);
      return;
    }
    setHours({
      days: {
        ...emptyDays(),
        mon: { ...DEFAULT_DAY },
        tue: { ...DEFAULT_DAY },
        wed: { ...DEFAULT_DAY },
        thu: { ...DEFAULT_DAY },
        fri: { ...DEFAULT_DAY },
      },
      holidayDates: [],
      closedOnPublicHolidays: false,
      note: null,
    });
  };

  const setDay = (day: DayOfWeek, value: BusinessDayHours | null) => {
    if (!hours) return;
    setHours({ ...hours, days: { ...hours.days, [day]: value } });
  };

  const applyWeekdays = () => {
    if (!hours) return;
    const mon = hours.days.mon ?? { ...DEFAULT_DAY };
    setHours({
      ...hours,
      days: {
        ...hours.days,
        mon: { ...mon },
        tue: { ...mon },
        wed: { ...mon },
        thu: { ...mon },
        fri: { ...mon },
      },
    });
  };

  const mode: AfterHoursMode = draft.afterHoursMode ?? "callback";
  const openNow = isWithinBusinessHoursPreview(hours);
  const afterHoursPreviewText =
    draft.afterHoursText?.trim() || defaultAfterHoursText(mode, draft.serviceName || "우리 가게");

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="영업시간"
        subtitle="영업시간을 설정하면 그 외 시간의 전화도 콜비가 알아서 응대해요."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-base font-semibold text-ink-900">요일별 영업시간</h2>
                <p className="mt-1 text-[13px] text-ink-500">
                  설정하지 않으면 24시간 응대로 동작해요. 마감이 자정을 넘는 심야
                  영업도 지원해요(예: 18:00~02:00).
                </p>
              </div>
              <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium text-ink-700">
                <input
                  type="checkbox"
                  checked={enabled}
                  onChange={(e) => toggleAll(e.target.checked)}
                  className="h-4 w-4 accent-brand-500"
                />
                영업시간 사용
              </label>
            </div>

            {enabled && hours ? (
              <div className="mt-5">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={applyWeekdays}
                    className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50"
                  >
                    월요일 시간을 평일에 일괄 적용
                  </button>
                </div>
                <div className="space-y-2">
                  {DAYS_OF_WEEK.map((day) => {
                    const d = hours.days[day];
                    const showBreak = !!breakOpenFor[day] || !!(d?.breakStart && d?.breakEnd);
                    return (
                      <div key={day} className="rounded-lg border border-ink-100 px-3 py-2.5">
                        <div className="flex flex-wrap items-center gap-3">
                          <label className="flex w-16 cursor-pointer items-center gap-2 text-sm font-semibold text-ink-800">
                            <input
                              type="checkbox"
                              checked={d !== null}
                              onChange={(e) =>
                                setDay(day, e.target.checked ? { ...DEFAULT_DAY } : null)
                              }
                              className="h-4 w-4 accent-brand-500"
                            />
                            {DAY_OF_WEEK_LABELS[day]}
                          </label>
                          {d ? (
                            <>
                              <div className="flex items-center gap-1.5 text-sm text-ink-700">
                                <input
                                  type="time"
                                  aria-label={`${DAY_OF_WEEK_LABELS[day]}요일 시작`}
                                  className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                                  value={d.open}
                                  onChange={(e) => setDay(day, { ...d, open: e.target.value })}
                                />
                                ~
                                <input
                                  type="time"
                                  aria-label={`${DAY_OF_WEEK_LABELS[day]}요일 마감`}
                                  className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                                  value={d.close}
                                  onChange={(e) => setDay(day, { ...d, close: e.target.value })}
                                />
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (showBreak) {
                                    const { breakStart: _bs, breakEnd: _be, ...rest } = d;
                                    setDay(day, rest);
                                    setBreakOpenFor((m) => ({ ...m, [day]: false }));
                                  } else {
                                    setBreakOpenFor((m) => ({ ...m, [day]: true }));
                                  }
                                }}
                                className="text-xs font-medium text-brand-600 hover:underline"
                              >
                                {showBreak ? "브레이크타임 삭제" : "+ 브레이크타임"}
                              </button>
                            </>
                          ) : (
                            <span className="text-sm text-ink-400">휴무</span>
                          )}
                        </div>
                        {d && showBreak ? (
                          <div className="mt-2 flex items-center gap-1.5 pl-[4.75rem] text-sm text-ink-500">
                            브레이크
                            <input
                              type="time"
                              aria-label={`${DAY_OF_WEEK_LABELS[day]}요일 브레이크 시작`}
                              className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                              value={d.breakStart ?? "15:00"}
                              onChange={(e) =>
                                setDay(day, {
                                  ...d,
                                  breakStart: e.target.value,
                                  breakEnd: d.breakEnd ?? "17:00",
                                })
                              }
                            />
                            ~
                            <input
                              type="time"
                              aria-label={`${DAY_OF_WEEK_LABELS[day]}요일 브레이크 종료`}
                              className="rounded-lg border border-ink-200 px-2 py-1.5 text-sm"
                              value={d.breakEnd ?? "17:00"}
                              onChange={(e) =>
                                setDay(day, {
                                  ...d,
                                  breakStart: d.breakStart ?? "15:00",
                                  breakEnd: e.target.value,
                                })
                              }
                            />
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>

                <div className="mt-5 space-y-4 border-t border-ink-100 pt-5">
                  <FormField
                    label="임시 휴무일"
                    hint="YYYY-MM-DD 형식으로 추가해요. 예: 2026-09-28"
                  >
                    <ChipsInput
                      values={hours.holidayDates ?? []}
                      onChange={(next) =>
                        setHours({
                          ...hours,
                          holidayDates: next.filter((v) => DATE_RE.test(v)),
                        })
                      }
                      placeholder="2026-09-28"
                      maxLength={10}
                    />
                  </FormField>
                  <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-700">
                    <input
                      type="checkbox"
                      checked={hours.closedOnPublicHolidays ?? false}
                      onChange={(e) =>
                        setHours({ ...hours, closedOnPublicHolidays: e.target.checked })
                      }
                      className="h-4 w-4 accent-brand-500"
                    />
                    공휴일은 휴무예요
                  </label>
                  <FormField label="안내 비고" hint="영업시간 안내에 덧붙일 한 마디. 최대 200자.">
                    <input
                      className={inputCls}
                      value={hours.note ?? ""}
                      maxLength={200}
                      onChange={(e) => setHours({ ...hours, note: e.target.value || null })}
                      placeholder="예: 매월 마지막 주 월요일은 정기 휴무입니다"
                    />
                  </FormField>
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <h2 className="text-base font-semibold text-ink-900">영업시간 외 응대 방식</h2>
            <p className="mt-1 text-[13px] text-ink-500">
              영업시간 외에 걸려온 전화를 어떻게 받을지 정해요.
            </p>
            <div className="mt-4 space-y-2">
              {AFTER_HOURS_MODES.map((m) => {
                const [title, ...rest] = AFTER_HOURS_MODE_LABELS[m].split(" — ");
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 transition-colors ${
                      mode === m
                        ? "border-brand-500 bg-brand-50/50 ring-2 ring-brand-100"
                        : "border-ink-200 hover:border-ink-300"
                    }`}
                  >
                    <input
                      type="radio"
                      name="afterHoursMode"
                      className="mt-0.5 h-4 w-4 accent-brand-500"
                      checked={mode === m}
                      onChange={() => patch({ afterHoursMode: m })}
                    />
                    <span>
                      <span className="block text-sm font-semibold text-ink-900">{title}</span>
                      <span className="mt-0.5 block text-[13px] leading-relaxed text-ink-500">
                        {rest.join(" — ")}
                      </span>
                    </span>
                  </label>
                );
              })}
            </div>
            <div className="mt-4">
              <FormField
                label="영업시간 외 안내 멘트"
                hint="비워두면 응대 방식별 기본 멘트를 사용해요. 최대 300자."
              >
                <textarea
                  rows={3}
                  className={textareaCls}
                  value={draft.afterHoursText ?? ""}
                  maxLength={300}
                  onChange={(e) => patch({ afterHoursText: e.target.value || null })}
                  placeholder={defaultAfterHoursText(mode, draft.serviceName || "{사업장 이름}")}
                />
              </FormField>
            </div>

            <SaveBar
              onSave={() => save()}
              saving={saving}
              savedAt={savedAt}
              error={saveError}
            />
          </Card>
        </div>

        {/* "지금 전화가 오면?" 미리보기 */}
        <Card className="lg:sticky lg:top-8">
          <h2 className="text-base font-semibold text-ink-900">지금 전화가 오면?</h2>
          <div className="mt-3">
            {!enabled ? (
              <>
                <Badge tone="bg-success-50 text-success-700">24시간 응대</Badge>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                  영업시간을 설정하지 않아 모든 전화를 바로 응대해요.
                </p>
              </>
            ) : openNow ? (
              <>
                <Badge tone="bg-success-50 text-success-700">영업 중</Badge>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                  지금은 영업시간이에요. AI 상담원이 평소처럼 인사하고 문의를
                  받아요.
                </p>
              </>
            ) : (
              <>
                <Badge tone="bg-warn-50 text-warn-700">영업시간 외</Badge>
                <p className="mt-3 text-[13px] leading-relaxed text-ink-500">
                  지금 전화가 오면 아래 멘트로 안내해요.
                </p>
                <div className="mt-3 rounded-xl rounded-tl-sm bg-ink-100 px-3 py-2 text-[13px] leading-relaxed text-ink-800">
                  {afterHoursPreviewText}
                </div>
                <p className="mt-2 text-[11px] text-ink-400">
                  {mode === "callback"
                    ? "이어서 성함·연락처를 받아 콜백을 접수해요."
                    : "영업시간을 안내하고 정중히 통화를 마쳐요."}
                </p>
              </>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
