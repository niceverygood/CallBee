import { useCallbacks } from "../api/hooks";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import {
  CALLBACK_STATUS_LABELS,
  CALLBACK_STATUS_TONE,
  CALLBACK_URGENCY_LABELS,
  formatDateTime,
} from "../lib/labels";

export function CallbacksPage() {
  const { data, isLoading, error } = useCallbacks();

  // 대기 → 예약 → 완료 → 취소 순, 최신순
  const rows = (data ?? [])
    .slice()
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const waiting = rows.filter((c) => c.status === "queued").length;

  return (
    <div>
      <PageHeader
        title="콜백 큐"
        subtitle={`대기 ${waiting}건`}
      />

      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}
      {data && rows.length === 0 ? (
        <EmptyBlock label="콜백 요청이 없습니다." />
      ) : null}

      {rows.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3">번호</th>
                <th className="px-4 py-3">구독자</th>
                <th className="px-4 py-3">요약</th>
                <th className="px-4 py-3">긴급도</th>
                <th className="px-4 py-3">예약</th>
                <th className="px-4 py-3">요청 시각</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.map((c) => (
                <tr key={String(c.id)} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <Badge tone={CALLBACK_STATUS_TONE[c.status]}>
                      {CALLBACK_STATUS_LABELS[c.status]}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 font-mono text-slate-700">
                    {c.phone}
                  </td>
                  <td className="px-4 py-3">{c.subscriberName ?? "—"}</td>
                  <td className="px-4 py-3 text-slate-600">{c.summary}</td>
                  <td className="px-4 py-3">
                    {CALLBACK_URGENCY_LABELS[c.urgency]}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {c.scheduledAt ? formatDateTime(c.scheduledAt) : "—"}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {formatDateTime(c.createdAt)}
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
