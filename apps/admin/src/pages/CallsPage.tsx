import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { INTENTS, EMOTIONS, CALL_OUTCOMES } from "@colli/contracts";
import type { Intent, Emotion, CallOutcome } from "@colli/contracts";
import { useCalls } from "../api/hooks";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import {
  intentLabel,
  EMOTION_LABELS,
  EMOTION_TONE,
  OUTCOME_LABELS,
  formatDateTime,
  formatDuration,
} from "../lib/labels";

export function CallsPage() {
  const { data, isLoading, error } = useCalls();
  const [intent, setIntent] = useState<Intent | "all">("all");
  const [emotion, setEmotion] = useState<Emotion | "all">("all");
  const [outcome, setOutcome] = useState<CallOutcome | "all">("all");

  const rows = useMemo(() => {
    return (data ?? []).filter(
      (c) =>
        (intent === "all" || c.intent === intent) &&
        (emotion === "all" || c.emotion === emotion) &&
        (outcome === "all" || c.outcome === outcome),
    );
  }, [data, intent, emotion, outcome]);

  return (
    <div>
      <PageHeader title="통화 목록" subtitle="발신번호 · 의도 · 결과 · 감정" />

      <div className="mb-4 flex flex-wrap gap-3">
        <Select
          label="의도"
          value={intent}
          onChange={(v) => setIntent(v as Intent | "all")}
          options={[
            ["all", "전체"],
            ...INTENTS.map((i) => [i, intentLabel(i)] as [string, string]),
          ]}
        />
        <Select
          label="감정"
          value={emotion}
          onChange={(v) => setEmotion(v as Emotion | "all")}
          options={[
            ["all", "전체"],
            ...EMOTIONS.map((e) => [e, EMOTION_LABELS[e]] as [string, string]),
          ]}
        />
        <Select
          label="결과"
          value={outcome}
          onChange={(v) => setOutcome(v as CallOutcome | "all")}
          options={[
            ["all", "전체"],
            ...CALL_OUTCOMES.map(
              (o) => [o, OUTCOME_LABELS[o]] as [string, string],
            ),
          ]}
        />
      </div>

      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}
      {data && rows.length === 0 ? (
        <EmptyBlock label="조건에 맞는 통화가 없습니다." />
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">시각</th>
                <th className="px-4 py-3">발신번호</th>
                <th className="px-4 py-3">구독자</th>
                <th className="px-4 py-3">의도</th>
                <th className="px-4 py-3">감정</th>
                <th className="px-4 py-3">결과</th>
                <th className="px-4 py-3">통화시간</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={String(c.id)} className="hover:bg-slate-50">
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(c.startedAt)}
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {c.from}
                  </td>
                  <td className="px-4 py-3">{c.subscriberName ?? "—"}</td>
                  <td className="px-4 py-3">{intentLabel(c.intent)}</td>
                  <td className="px-4 py-3">
                    {c.emotion ? (
                      <Badge tone={EMOTION_TONE[c.emotion]}>
                        {EMOTION_LABELS[c.emotion]}
                      </Badge>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {c.outcome ? OUTCOME_LABELS[c.outcome] : "—"}
                  </td>
                  <td className="px-4 py-3 tabular-nums text-slate-500">
                    {formatDuration(c.durationSec)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      to={`/calls/${encodeURIComponent(String(c.id))}`}
                      className="font-medium text-brand-600 hover:underline"
                    >
                      상세
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: [string, string][];
}) {
  return (
    <label className="text-xs font-medium text-slate-500">
      {label}
      <select
        className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm text-slate-700 focus:border-brand-500 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}
