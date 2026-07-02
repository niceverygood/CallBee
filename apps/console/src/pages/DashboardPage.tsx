import { Link } from "react-router-dom";
import { isPhoneNumberAssigned, TENANT_PLAN_METAS } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTenant, useAgentConfig, useIntents, useKb, useCalls } from "../api/hooks";
import { maskPhone, formatDateTime, formatDuration } from "../lib/format";
import { OUTCOME_LABELS, OUTCOME_BADGE_TONES } from "../lib/labels";
import { Card } from "../components/ui";
import { Badge, StatusBadge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";

/**
 * 대시보드(v1 경량) — product-spec §5.
 * 환영 헤더 + 070 번호 카드(미배정 안내) + 설정 체크리스트 + 최근 통화 5건.
 */
export function DashboardPage() {
  const tenantId = useTenantId();
  const { data: tenant, isLoading, error } = useTenant(tenantId);
  const { data: config } = useAgentConfig(tenantId);
  const { data: intents } = useIntents(tenantId);
  const { data: kb } = useKb(tenantId);
  const { data: recentCalls } = useCalls(tenantId, { limit: 5 });

  if (isLoading) return <Loading />;
  if (error || !tenant) return <ErrorBlock error={error ?? new Error("불러오지 못했어요")} />;

  const assigned = isPhoneNumberAssigned(tenant.phoneNumber);
  const planMeta = TENANT_PLAN_METAS[tenant.plan];

  const checklist = [
    {
      key: "greeting",
      label: "첫인사 멘트 정하기",
      done: !!config?.greetingText,
      to: `/tenants/${tenantId}/studio/profile`,
    },
    {
      key: "hours",
      label: "영업시간 설정하기",
      done: !!config?.businessHours,
      to: `/tenants/${tenantId}/settings/hours`,
    },
    {
      key: "intents",
      label: "자주 오는 문의 유형 등록하기",
      done: (intents?.length ?? 0) > 0,
      to: `/tenants/${tenantId}/studio/intents`,
    },
    {
      key: "kb",
      label: "자주 묻는 질문 채우기",
      done: (kb?.length ?? 0) > 0,
      to: `/tenants/${tenantId}/studio/kb`,
    },
  ];
  const doneCount = checklist.filter((c) => c.done).length;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      {/* 환영 헤더 */}
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-[28px] font-bold leading-snug text-ink-900">
            사장님, 콜비가 오늘도 전화를 받고 있어요
          </h1>
          <p className="mt-1 flex items-center gap-2 text-sm text-ink-500">
            {tenant.name} · {tenant.industryLabel ?? "업종 미지정"}
            <StatusBadge status={tenant.status} />
          </p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 070 번호 카드 */}
        <Card>
          <h2 className="text-xl font-bold text-ink-900">우리 가게 070 번호</h2>
          {assigned ? (
            <>
              <p className="mt-4 text-3xl font-extrabold tracking-tight text-ink-900">
                {tenant.phoneNumber}
              </p>
              <p className="mt-2 text-[13px] text-ink-500">
                이 번호로 걸려오는 전화를 AI 상담원이 받고 있어요.
              </p>
            </>
          ) : (
            <>
              <p className="mt-4 flex items-center gap-2">
                <span className="text-2xl font-bold text-ink-400">미배정</span>
                <Badge tone="bg-warn-50 text-warn-700">배정 대기</Badge>
              </p>
              <p className="mt-2 text-[13px] leading-relaxed text-ink-500">
                신청이 승인되면 콜비가 전용 070 번호를 배정해 드려요. 번호가
                배정되면 여기에서 바로 확인할 수 있어요.
              </p>
            </>
          )}
          <div className="mt-4 border-t border-ink-100 pt-4 text-[13px] text-ink-500">
            요금제: <span className="font-semibold text-ink-700">{planMeta.name}</span> ·{" "}
            {planMeta.priceLabel}
          </div>
        </Card>

        {/* 설정 체크리스트 */}
        <Card>
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-ink-900">시작 체크리스트</h2>
            <span className="text-[13px] font-semibold text-ink-500">
              {doneCount}/{checklist.length} 완료
            </span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-brand-200/50">
            <div
              className="h-full rounded-full bg-brand-400 transition-all"
              style={{ width: `${(doneCount / checklist.length) * 100}%` }}
            />
          </div>
          <ul className="mt-4 space-y-1">
            {checklist.map((item) => (
              <li key={item.key}>
                <Link
                  to={item.to}
                  className="flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-ink-50"
                >
                  <span
                    aria-hidden="true"
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold ${
                      item.done
                        ? "bg-success-50 text-success-600"
                        : "border border-ink-300 text-transparent"
                    }`}
                  >
                    ✓
                  </span>
                  <span
                    className={`text-sm ${
                      item.done ? "text-ink-400 line-through" : "font-medium text-ink-700"
                    }`}
                  >
                    {item.label}
                  </span>
                  <span aria-hidden="true" className="ml-auto text-ink-300">
                    ›
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      {/* 최근 통화 5건 */}
      <Card>
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-bold text-ink-900">최근 통화</h2>
          <Link
            to={`/tenants/${tenantId}/calls`}
            className="text-[13px] font-semibold text-brand-600 hover:underline"
          >
            전체 보기
          </Link>
        </div>
        {recentCalls && recentCalls.length > 0 ? (
          <ul className="divide-y divide-ink-100">
            {recentCalls.map((c) => (
              <li key={String(c.id)}>
                <Link
                  to={`/tenants/${tenantId}/calls/${c.id}`}
                  className="flex items-center gap-4 px-1 py-3 hover:bg-ink-50"
                >
                  <span className="w-32 shrink-0 text-sm font-medium text-ink-900">
                    {maskPhone(c.from)}
                  </span>
                  <span className="hidden text-[13px] text-ink-500 sm:block">
                    {formatDateTime(c.startedAt)}
                  </span>
                  <span className="hidden text-[13px] text-ink-500 sm:block">
                    {formatDuration(c.durationSec)}
                  </span>
                  <span className="ml-auto">
                    {c.outcome ? (
                      <Badge tone={OUTCOME_BADGE_TONES[c.outcome]}>
                        {OUTCOME_LABELS[c.outcome]}
                      </Badge>
                    ) : (
                      <Badge>진행 중</Badge>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <EmptyBlock label="아직 받은 전화가 없어요. 070 번호가 연결되면 여기에 기록이 쌓여요." />
        )}
      </Card>
    </div>
  );
}
