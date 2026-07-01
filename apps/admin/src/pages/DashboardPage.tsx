import { useMetrics } from "../api/hooks";
import { MetricCard } from "../components/MetricCard";
import { PageHeader } from "../components/PageHeader";
import { Loading, ErrorBlock } from "../components/StateBlock";
import { formatPercent } from "../lib/labels";

export function DashboardPage() {
  const { data, isLoading, error } = useMetrics();

  return (
    <div>
      <PageHeader title="대시보드" subtitle="AI 응대 핵심 지표" />
      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}
      {data ? (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MetricCard
            label="응대율"
            value={formatPercent(data.answerRate)}
            hint={`총 통화 ${data.totalCalls}건`}
            accent="text-green-600"
          />
          <MetricCard
            label="티켓 자동해결률"
            value={formatPercent(data.autoResolveRate)}
            hint="KB 로 즉시 해결"
            accent="text-brand-600"
          />
          <MetricCard
            label="사람 인계 수"
            value={data.handoffCount}
            hint="영업/개발/CS"
            accent="text-orange-600"
          />
          <MetricCard
            label="콜백 대기"
            value={data.callbackWaiting}
            hint={`열린 티켓 ${data.openTickets}건`}
            accent="text-amber-600"
          />
        </div>
      ) : null}
    </div>
  );
}
