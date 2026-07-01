/**
 * 콜비 총괄관리자 전용: 전체 테넌트 목록 + 신규 테넌트/관리자 계정 생성.
 *
 * 호출 엔드포인트(authApi, fetch 모드):
 *   - GET  /admin/tenants  → TenantSummary[]
 *   - POST /admin/tenants  → CreateTenantAccountRequest 를 받아
 *     CreateTenantAccountResult({ tenantId, account }) 를 반환.
 * fixture 모드에서는 authApi.ts 의 인메모리 목 데이터로 동작한다.
 */
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantStatus, TenantPlan } from "@colli/contracts";
import { authApi } from "../auth/authApi";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";

const STATUS_LABELS: Record<TenantStatus, string> = {
  onboarding: "온보딩",
  active: "활성",
  suspended: "정지",
};

const STATUS_TONE: Record<TenantStatus, string> = {
  onboarding: "bg-amber-100 text-amber-800",
  active: "bg-green-100 text-green-700",
  suspended: "bg-red-100 text-red-700",
};

const PLAN_LABELS: Record<TenantPlan, string> = {
  trial: "체험",
  starter: "스타터",
  pro: "프로",
  enterprise: "엔터프라이즈",
};

const qk = { tenants: ["admin", "tenants"] as const };

function emptyForm() {
  return {
    companyName: "",
    industryLabel: "",
    phoneNumber: "",
    adminEmail: "",
    adminPassword: "",
  };
}

export function TenantsAdminPage() {
  const qc = useQueryClient();
  const { data, isLoading, error } = useQuery({
    queryKey: qk.tenants,
    queryFn: () => authApi.listTenants(),
  });

  const [form, setForm] = useState(emptyForm());
  const [result, setResult] = useState<{ email: string } | null>(null);

  const create = useMutation({
    mutationFn: () =>
      authApi.createTenantAccount({
        companyName: form.companyName.trim(),
        industryLabel: form.industryLabel.trim() || undefined,
        phoneNumber: form.phoneNumber.trim(),
        adminEmail: form.adminEmail.trim(),
        adminPassword: form.adminPassword,
      }),
    onSuccess: (res) => {
      setResult({ email: res.account.email });
      setForm(emptyForm());
      qc.invalidateQueries({ queryKey: qk.tenants });
    },
  });

  const canSubmit =
    form.companyName.trim() &&
    form.phoneNumber.trim() &&
    form.adminEmail.trim() &&
    form.adminPassword.trim();

  return (
    <div>
      <PageHeader
        title="테넌트 관리"
        subtitle="전체 테넌트 조회 및 신규 테넌트 · 관리자 계정 생성"
      />

      <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4">
        <h2 className="mb-3 text-sm font-semibold text-slate-700">
          신규 테넌트 계정 생성
        </h2>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setResult(null);
            create.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="text-xs font-medium text-slate-500">
            업체명
            <input
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="예: BoBi"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            업종 (선택)
            <input
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.industryLabel}
              onChange={(e) => setForm({ ...form, industryLabel: e.target.value })}
              placeholder="예: 보험설계사 SaaS"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            070 번호
            <input
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+8207011112222"
            />
          </label>
          <label className="text-xs font-medium text-slate-500">
            관리자 이메일
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="owner@tenant.example"
            />
          </label>
          <label className="text-xs font-medium text-slate-500 sm:col-span-2">
            관리자 비밀번호
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!canSubmit || create.isPending}
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              {create.isPending ? "생성 중…" : "테넌트 · 관리자 계정 생성"}
            </button>
          </div>
        </form>

        {create.isError ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            생성 실패:{" "}
            {create.error instanceof Error ? create.error.message : String(create.error)}
          </p>
        ) : null}
        {result ? (
          <p className="mt-3 rounded-lg bg-green-50 px-3 py-2 text-sm text-green-700">
            계정이 생성되었습니다. <strong>{result.email}</strong> 로 콘솔
            앱(apps/console)에 로그인하세요.
          </p>
        ) : null}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-slate-700">전체 테넌트</h2>
        {isLoading ? <Loading /> : null}
        {error ? <ErrorBlock error={error} /> : null}
        {data && data.length === 0 ? (
          <EmptyBlock label="등록된 테넌트가 없습니다." />
        ) : null}
        {data && data.length > 0 ? (
          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 text-xs font-semibold text-slate-500">
                <tr>
                  <th className="px-4 py-2">업체명</th>
                  <th className="px-4 py-2">slug</th>
                  <th className="px-4 py-2">업종</th>
                  <th className="px-4 py-2">070 번호</th>
                  <th className="px-4 py-2">상태</th>
                  <th className="px-4 py-2">플랜</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.map((t) => (
                  <tr key={String(t.tenantId)}>
                    <td className="px-4 py-2 font-medium text-slate-800">{t.name}</td>
                    <td className="px-4 py-2 text-slate-500">{t.slug}</td>
                    <td className="px-4 py-2 text-slate-600">
                      {t.industryLabel ?? "-"}
                    </td>
                    <td className="px-4 py-2 text-slate-600">{t.phoneNumber}</td>
                    <td className="px-4 py-2">
                      <Badge tone={STATUS_TONE[t.status]}>
                        {STATUS_LABELS[t.status]}
                      </Badge>
                    </td>
                    <td className="px-4 py-2 text-slate-600">
                      {PLAN_LABELS[t.plan]}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>
    </div>
  );
}
