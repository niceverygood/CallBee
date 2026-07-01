import { Link } from "react-router-dom";
import { TICKET_STATUSES, TICKET_SEVERITIES } from "@colli/contracts";
import type { TicketStatus, TicketSeverity } from "@colli/contracts";
import { useTickets, useUpdateTicket } from "../api/hooks";
import type { TicketRow } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock } from "../components/StateBlock";
import {
  intentLabel,
  TICKET_STATUS_LABELS,
  TICKET_STATUS_TONE,
  TICKET_SEVERITY_LABELS,
  SEVERITY_TONE,
} from "../lib/labels";

export function TicketsPage() {
  const { data, isLoading, error } = useTickets();
  const update = useUpdateTicket();

  return (
    <div>
      <PageHeader title="티켓 보드" subtitle="상태 · 담당 · 심각도" />

      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}

      {data ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {TICKET_STATUSES.map((status) => {
            const col = data.filter((t) => t.status === status);
            return (
              <div key={status} className="rounded-xl bg-slate-100/60 p-3">
                <div className="mb-3 flex items-center justify-between px-1">
                  <span className="text-sm font-semibold text-slate-700">
                    {TICKET_STATUS_LABELS[status]}
                  </span>
                  <Badge tone={TICKET_STATUS_TONE[status]}>{col.length}</Badge>
                </div>
                <div className="space-y-2">
                  {col.map((t) => (
                    <TicketCard
                      key={String(t.id)}
                      ticket={t}
                      onChange={(patch) =>
                        update.mutate({ id: String(t.id), patch })
                      }
                    />
                  ))}
                  {col.length === 0 ? (
                    <div className="rounded-lg border border-dashed border-slate-300 p-4 text-center text-xs text-slate-400">
                      없음
                    </div>
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function TicketCard({
  ticket,
  onChange,
}: {
  ticket: TicketRow;
  onChange: (patch: {
    status?: TicketStatus;
    severity?: TicketSeverity;
    assignee?: string | null;
  }) => void;
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm">
      <div className="mb-1 flex items-center justify-between">
        <span className="font-mono text-xs text-slate-400">
          {String(ticket.id)}
        </span>
        <Badge tone={SEVERITY_TONE[ticket.severity]}>
          {TICKET_SEVERITY_LABELS[ticket.severity]}
        </Badge>
      </div>
      <p className="text-sm font-medium text-slate-800">{ticket.summary}</p>
      <div className="mt-1 text-xs text-slate-500">
        {intentLabel(ticket.category)} · {ticket.subscriberName ?? "—"}
        {ticket.callId ? (
          <>
            {" · "}
            <Link
              to={`/calls/${encodeURIComponent(String(ticket.callId))}`}
              className="text-brand-600 hover:underline"
            >
              통화
            </Link>
          </>
        ) : null}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <select
          aria-label="상태"
          className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
          value={ticket.status}
          onChange={(e) => onChange({ status: e.target.value as TicketStatus })}
        >
          {TICKET_STATUSES.map((s) => (
            <option key={s} value={s}>
              {TICKET_STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select
          aria-label="심각도"
          className="rounded border border-slate-300 px-1.5 py-1 text-xs text-slate-700"
          value={ticket.severity}
          onChange={(e) =>
            onChange({ severity: e.target.value as TicketSeverity })
          }
        >
          {TICKET_SEVERITIES.map((s) => (
            <option key={s} value={s}>
              {TICKET_SEVERITY_LABELS[s]}
            </option>
          ))}
        </select>
      </div>
      <input
        aria-label="담당자"
        className="mt-2 w-full rounded border border-slate-300 px-2 py-1 text-xs text-slate-700"
        placeholder="담당자 미배정"
        defaultValue={ticket.assignee ?? ""}
        onBlur={(e) => {
          const next = e.target.value.trim() || null;
          if (next !== (ticket.assignee ?? null)) onChange({ assignee: next });
        }}
      />
    </div>
  );
}
