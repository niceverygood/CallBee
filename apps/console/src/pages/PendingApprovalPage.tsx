import type { ReactNode } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { TENANT_PLAN_METAS } from "@colli/contracts";
import { IS_FIXTURE, getCurrentTenantId, FIXTURE_TENANT_ID } from "../api/client";
import { useTenant } from "../api/hooks";
import { useSession } from "../lib/useSession";
import { logoutSession } from "../lib/session";
import { formatDateTime } from "../lib/format";
import { SUPPORT_EMAIL } from "../lib/labels";
import { Logo, BeeMark, btnPrimary, btnSecondary, btnGhost } from "../components/ui";
import { StatusBadge } from "../components/Badge";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 승인 대기·반려 화면(/pending) — product-spec §3.1.
 * - status=pending_approval: 접수 안내 + 신청 요약 카드 + 새로고침/문의/로그아웃.
 * - status=rejected: 반려 사유(rejectionReason 원문) + 문의 유도.
 * - active/onboarding 상태로 진입하면 대시보드로 돌려보낸다.
 */
export function PendingApprovalPage() {
  const navigate = useNavigate();
  const session = useSession();
  const tenantId = getCurrentTenantId();
  const { data: tenant, isLoading, error, refetch, isRefetching } = useTenant(tenantId ?? "");

  if (!IS_FIXTURE && !session) return <Navigate to="/login" replace />;
  if (!tenantId) return <Navigate to="/login" replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Loading />
      </div>
    );
  }
  if (error || !tenant) {
    return (
      <div className="mx-auto max-w-xl px-6 py-16">
        <ErrorBlock error={error ?? new Error("사업장 정보를 불러오지 못했어요.")} />
      </div>
    );
  }

  if (tenant.status !== "pending_approval" && tenant.status !== "rejected") {
    return <Navigate to={`/tenants/${tenantId}/dashboard`} replace />;
  }

  const onLogout = () => {
    logoutSession();
    // 데모 모드는 로그아웃하면 기본 데모 사업장(BoBi)으로 복귀한다.
    navigate(IS_FIXTURE ? `/tenants/${FIXTURE_TENANT_ID}/dashboard` : "/login", {
      replace: true,
    });
  };

  const rejected = tenant.status === "rejected";
  const planMeta = TENANT_PLAN_METAS[tenant.plan];

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="border-b border-ink-100 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-6 py-4">
          <Logo />
          <button type="button" onClick={onLogout} className={btnGhost}>
            로그아웃
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-xl border border-ink-200 bg-white p-8 text-center">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-50">
            <BeeMark size={40} />
          </div>

          {rejected ? (
            <>
              <h1 className="mt-5 text-[28px] font-bold leading-snug text-ink-900">
                신청을 승인하지 못했어요
              </h1>
              <div className="mx-auto mt-5 max-w-md rounded-xl border border-danger-600/20 bg-danger-50 p-4 text-left">
                <div className="text-[13px] font-semibold text-danger-700">반려 사유</div>
                <p className="mt-1 whitespace-pre-wrap text-sm leading-relaxed text-danger-700">
                  {tenant.rejectionReason ?? "사유가 입력되지 않았어요. 아래로 문의해 주세요."}
                </p>
              </div>
              <p className="mx-auto mt-5 max-w-md text-sm leading-relaxed text-ink-600">
                아래 사유를 확인하신 뒤 문의 주시면 다시 도와드릴게요.
              </p>
            </>
          ) : (
            <>
              <h1 className="mt-5 text-[28px] font-bold leading-snug text-ink-900">
                신청이 접수됐어요
              </h1>
              <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-ink-600">
                콜비 팀이 사업장 정보를 확인하고 있어요. 보통{" "}
                <strong className="font-semibold text-ink-900">1영업일 안에</strong> 승인되고,
                승인되면 전용 070 번호가 배정돼요. 승인 결과는 가입하신 이메일로도
                알려드릴게요.
              </p>
            </>
          )}

          {/* 신청 요약 카드 */}
          <dl className="mx-auto mt-7 max-w-md space-y-3 rounded-xl bg-ink-50 p-5 text-left">
            <SummaryRow label="사업장 이름">{tenant.name}</SummaryRow>
            <SummaryRow label="업종">{tenant.industryLabel ?? "미지정"}</SummaryRow>
            <SummaryRow label="요금제">
              {planMeta.name} · {planMeta.priceLabel}
            </SummaryRow>
            {tenant.appliedAt ? (
              <SummaryRow label="신청 시각">{formatDateTime(tenant.appliedAt)}</SummaryRow>
            ) : null}
            <SummaryRow label="상태">
              <StatusBadge status={tenant.status} />
            </SummaryRow>
          </dl>

          <div className="mt-7 flex flex-col items-center justify-center gap-2.5 sm:flex-row">
            {!rejected ? (
              <button
                type="button"
                onClick={() => refetch()}
                disabled={isRefetching}
                className={`${btnPrimary} min-w-[7.5rem]`}
              >
                {isRefetching ? "확인 중…" : "새로고침"}
              </button>
            ) : null}
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(
                `[콜비] ${tenant.name} ${rejected ? "반려 문의" : "승인 문의"}`,
              )}`}
              className={rejected ? btnPrimary : btnSecondary}
            >
              문의하기
            </a>
          </div>
        </div>
      </main>
    </div>
  );
}

function SummaryRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-[13px] font-semibold text-ink-500">{label}</dt>
      <dd className="truncate text-sm font-medium text-ink-900">{children}</dd>
    </div>
  );
}
