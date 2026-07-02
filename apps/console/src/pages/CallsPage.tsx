import { Link } from "react-router-dom";
import { useTenantId } from "../lib/tenant";
import { useCalls, useIntents } from "../api/hooks";
import { maskPhone, formatDateTime, formatDuration } from "../lib/format";
import { OUTCOME_LABELS, OUTCOME_BADGE_TONES } from "../lib/labels";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";

/**
 * 통화 기록 목록 — product-spec §4.9.
 * 발신번호(마스킹)/시각/통화 시간/문의 유형/결과 뱃지. 행 클릭 → 상세.
 */
export function CallsPage() {
  const tenantId = useTenantId();
  const { data, isLoading, error } = useCalls(tenantId);
  const { data: intents } = useIntents(tenantId);

  const intentLabel = (key: string | null) => {
    if (!key) return "—";
    return intents?.find((i) => String(i.key) === key)?.label ?? key;
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="통화 기록"
        subtitle="AI 상담원이 받은 전화를 확인하고, 응대 내용을 다시 살펴보세요."
      />

      {data && data.length === 0 ? (
        <EmptyBlock label="아직 받은 전화가 없어요. 070 번호가 연결되면 여기에 기록이 쌓여요." />
      ) : null}

      {data && data.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[13px] font-semibold text-ink-500">
                <th className="px-4 py-3">발신번호</th>
                <th className="hidden px-4 py-3 sm:table-cell">시각</th>
                <th className="hidden px-4 py-3 sm:table-cell">통화 시간</th>
                <th className="hidden px-4 py-3 md:table-cell">문의 유형</th>
                <th className="px-4 py-3">결과</th>
                <th className="px-2 py-3" />
              </tr>
            </thead>
            <tbody>
              {data.map((c) => (
                <tr key={String(c.id)} className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50">
                  <td className="p-0" colSpan={6}>
                    <Link
                      to={`/tenants/${tenantId}/calls/${c.id}`}
                      className="flex w-full items-center"
                    >
                      <span className="w-[30%] px-4 py-3.5 font-medium text-ink-900 sm:w-[22%]">
                        {maskPhone(c.from)}
                      </span>
                      <span className="hidden w-[20%] px-4 py-3.5 text-ink-700 sm:block">
                        {formatDateTime(c.startedAt)}
                      </span>
                      <span className="hidden w-[15%] px-4 py-3.5 text-ink-700 sm:block">
                        {formatDuration(c.durationSec)}
                      </span>
                      <span className="hidden w-[18%] px-4 py-3.5 text-ink-700 md:block">
                        {intentLabel(c.intent)}
                      </span>
                      <span className="flex-1 px-4 py-3.5">
                        {c.outcome ? (
                          <Badge tone={OUTCOME_BADGE_TONES[c.outcome]}>
                            {OUTCOME_LABELS[c.outcome]}
                          </Badge>
                        ) : (
                          <Badge>진행 중</Badge>
                        )}
                      </span>
                      <span aria-hidden="true" className="px-3 text-ink-300">
                        ›
                      </span>
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
