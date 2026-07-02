/**
 * 콜비 총괄관리자 전용: 승인 큐 + 전체 테넌트 목록 + 신규 테넌트/관리자 계정 생성.
 *
 * 호출 엔드포인트(authApi, fetch 모드):
 *   - GET  /admin/tenants               → TenantSummary[] (+ownerEmail 표시 전용)
 *   - POST /admin/tenants               → CreateTenantAccountRequest → CreateTenantAccountResult
 *   - POST /admin/tenants/:id/approve   → ApproveTenantRequest{phoneNumber} → TenantReviewResult
 *   - POST /admin/tenants/:id/reject    → RejectTenantRequest{reason} → TenantReviewResult
 * fixture 모드에서는 authApi.ts 의 인메모리 목 데이터(승인 대기 2건 포함)로 동작한다.
 *
 * 상태 라벨은 @colli/contracts 의 TENANT_STATUS_LABELS 를 재사용하고,
 * 뱃지 색은 docs/brand-guide.md §4.4 조합을 따른다.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TenantStatus, TenantReviewResult } from "@colli/contracts";
import {
  TENANT_STATUS_LABELS,
  TENANT_PLAN_METAS,
  isPhoneNumberAssigned,
} from "@colli/contracts";
import { authApi, apiErrorCode } from "../auth/authApi";
import type { TenantAdminListItem } from "../auth/authApi";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { formatDateTime } from "../lib/labels";

/** 상태 뱃지 색 — brand-guide §4.4 (배경 50 + 텍스트 700 조합 고정) */
const STATUS_TONE: Record<TenantStatus, string> = {
  onboarding: "bg-info-50 text-info-600",
  active: "bg-success-50 text-success-700",
  suspended: "bg-ink-100 text-ink-600",
  pending_approval: "bg-warn-50 text-warn-700",
  rejected: "bg-danger-50 text-danger-700",
};

const qk = { tenants: ["admin", "tenants"] as const };

type QueueFilter = "pending" | "all" | "active" | "rejected" | "suspended";

/** 070 번호: 숫자/하이픈만, 숫자 9~13자리 */
function isValidPhoneNumber(v: string): boolean {
  if (!/^[0-9-]+$/.test(v)) return false;
  const digits = v.replace(/-/g, "");
  return digits.length >= 9 && digits.length <= 13;
}

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

  const [filter, setFilter] = useState<QueueFilter>("pending");
  const [approveTarget, setApproveTarget] = useState<TenantAdminListItem | null>(null);
  const [rejectTarget, setRejectTarget] = useState<TenantAdminListItem | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    },
    [],
  );

  function showToast(msg: string) {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToast(msg);
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  }

  const pending = useMemo(
    () =>
      (data ?? [])
        .filter((t) => t.status === "pending_approval")
        .sort((a, b) => (a.appliedAt ?? "").localeCompare(b.appliedAt ?? "")),
    [data],
  );

  const filtered = useMemo(() => {
    if (!data) return [];
    if (filter === "pending") return pending;
    if (filter === "all") return data;
    return data.filter((t) => t.status === filter);
  }, [data, filter, pending]);

  const filters: Array<{ key: QueueFilter; label: string }> = [
    { key: "pending", label: `신청 대기 ${pending.length}` },
    { key: "all", label: "전체" },
    { key: "active", label: TENANT_STATUS_LABELS.active },
    { key: "rejected", label: TENANT_STATUS_LABELS.rejected },
    { key: "suspended", label: TENANT_STATUS_LABELS.suspended },
  ];

  // ── 기존: 신규 테넌트 + 관리자 계정 직접 생성 (기능 무변경) ────
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
        title="사업장 관리"
        subtitle="신청 심사(승인·반려), 전체 사업장 조회, 신규 테넌트 · 관리자 계정 생성"
      />

      {toast ? (
        <div
          role="status"
          className="mb-4 rounded-lg border border-success-600/20 bg-success-50 px-4 py-2.5 text-sm font-medium text-success-700"
        >
          {toast}
        </div>
      ) : null}

      {/* ── 승인 큐 / 사업장 목록 ─────────────────────────────── */}
      <section className="mb-6">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          {filters.map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setFilter(f.key)}
              className={`rounded-full px-3.5 py-1.5 text-[13px] font-semibold transition-colors ${
                filter === f.key
                  ? "bg-ink-900 text-white"
                  : "border border-ink-200 bg-white text-ink-600 hover:bg-ink-50"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        {isLoading ? <Loading /> : null}
        {error ? <ErrorBlock error={error} /> : null}

        {data && filter === "pending" ? (
          pending.length === 0 ? (
            <EmptyBlock label="승인 대기 중인 신청이 없어요." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-[13px] font-semibold text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5">사업장</th>
                    <th className="px-4 py-2.5">업종</th>
                    <th className="px-4 py-2.5">요금제</th>
                    <th className="px-4 py-2.5">연락처</th>
                    <th className="px-4 py-2.5">이메일</th>
                    <th className="px-4 py-2.5">신청 시각</th>
                    <th className="px-4 py-2.5">액션</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {pending.map((t) => (
                    <tr key={String(t.tenantId)} className="hover:bg-ink-50">
                      <td className="px-4 py-3 font-medium text-ink-800">{t.name}</td>
                      <td className="px-4 py-3 text-ink-600">{t.industryLabel ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-600">
                        {TENANT_PLAN_METAS[t.plan].name}
                      </td>
                      <td className="px-4 py-3 text-ink-600">{t.contactPhone ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-600">{t.ownerEmail ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-600">
                        {t.appliedAt ? formatDateTime(t.appliedAt) : "-"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setApproveTarget(t)}
                            className="rounded-lg bg-brand-400 px-3 py-1.5 text-xs font-semibold text-ink-900 hover:bg-brand-500"
                          >
                            승인
                          </button>
                          <button
                            type="button"
                            onClick={() => setRejectTarget(t)}
                            className="rounded-lg border border-ink-200 bg-white px-3 py-1.5 text-xs font-medium text-danger-600 hover:bg-danger-50"
                          >
                            반려
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}

        {data && filter !== "pending" ? (
          filtered.length === 0 ? (
            <EmptyBlock label="해당 상태의 사업장이 없습니다." />
          ) : (
            <div className="overflow-hidden rounded-xl border border-ink-200 bg-white">
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-200 bg-ink-50 text-[13px] font-semibold text-ink-500">
                  <tr>
                    <th className="px-4 py-2.5">사업장</th>
                    <th className="px-4 py-2.5">slug</th>
                    <th className="px-4 py-2.5">업종</th>
                    <th className="px-4 py-2.5">070 번호</th>
                    <th className="px-4 py-2.5">상태</th>
                    <th className="px-4 py-2.5">요금제</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100">
                  {filtered.map((t) => (
                    <tr key={String(t.tenantId)} className="hover:bg-ink-50">
                      <td className="px-4 py-3 font-medium text-ink-800">{t.name}</td>
                      <td className="px-4 py-3 text-ink-500">{t.slug}</td>
                      <td className="px-4 py-3 text-ink-600">{t.industryLabel ?? "-"}</td>
                      <td className="px-4 py-3 text-ink-600">
                        {isPhoneNumberAssigned(t.phoneNumber) ? (
                          t.phoneNumber
                        ) : (
                          <span className="text-ink-400">미배정</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Badge tone={STATUS_TONE[t.status]}>
                          {TENANT_STATUS_LABELS[t.status]}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-ink-600">
                        {TENANT_PLAN_METAS[t.plan].name}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : null}
      </section>

      {/* ── 기존: 신규 테넌트 계정 직접 생성 (영업 직접 온보딩용) ── */}
      <section className="mb-6 rounded-xl border border-ink-200 bg-white p-4">
        <h2 className="mb-1 text-sm font-semibold text-ink-700">신규 테넌트 계정 생성</h2>
        <p className="mb-3 text-xs text-ink-500">
          영업이 직접 온보딩하는 경우 — 즉시 운영 중 상태로 생성되고 070 번호를 바로
          입력해요.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setResult(null);
            create.mutate();
          }}
          className="grid gap-3 sm:grid-cols-2"
        >
          <label className="text-xs font-medium text-ink-500">
            업체명
            <input
              required
              className="mt-1 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={form.companyName}
              onChange={(e) => setForm({ ...form, companyName: e.target.value })}
              placeholder="예: BoBi"
            />
          </label>
          <label className="text-xs font-medium text-ink-500">
            업종 (선택)
            <input
              className="mt-1 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={form.industryLabel}
              onChange={(e) => setForm({ ...form, industryLabel: e.target.value })}
              placeholder="예: 보험설계사 SaaS"
            />
          </label>
          <label className="text-xs font-medium text-ink-500">
            070 번호
            <input
              required
              className="mt-1 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={form.phoneNumber}
              onChange={(e) => setForm({ ...form, phoneNumber: e.target.value })}
              placeholder="+8207011112222"
            />
          </label>
          <label className="text-xs font-medium text-ink-500">
            관리자 이메일
            <input
              type="email"
              required
              className="mt-1 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={form.adminEmail}
              onChange={(e) => setForm({ ...form, adminEmail: e.target.value })}
              placeholder="owner@tenant.example"
            />
          </label>
          <label className="text-xs font-medium text-ink-500 sm:col-span-2">
            관리자 비밀번호
            <input
              type="password"
              required
              className="mt-1 block w-full rounded-lg border border-ink-200 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100"
              value={form.adminPassword}
              onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
              placeholder="••••••••"
            />
          </label>
          <div className="sm:col-span-2">
            <button
              type="submit"
              disabled={!canSubmit || create.isPending}
              className="rounded-lg bg-brand-400 px-3 py-1.5 text-sm font-semibold text-ink-900 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
            >
              {create.isPending ? "생성 중…" : "테넌트 · 관리자 계정 생성"}
            </button>
          </div>
        </form>

        {create.isError ? (
          <p className="mt-3 rounded-lg bg-danger-50 px-3 py-2 text-sm text-danger-700">
            생성 실패:{" "}
            {create.error instanceof Error ? create.error.message : String(create.error)}
          </p>
        ) : null}
        {result ? (
          <p className="mt-3 rounded-lg bg-success-50 px-3 py-2 text-sm text-success-700">
            계정이 생성되었습니다. <strong>{result.email}</strong> 로 콘솔
            앱(apps/console)에 로그인하세요.
          </p>
        ) : null}
      </section>

      {approveTarget ? (
        <ApproveModal
          tenant={approveTarget}
          onClose={() => setApproveTarget(null)}
          onSuccess={(result) => {
            setApproveTarget(null);
            // 업종 팩 자동 적용 결과까지 관리자에게 그대로 알린다(v0.6.0).
            if (result.industryTemplate) {
              showToast(
                `승인 완료 — 070 배정됨 · ${result.industryTemplate.packTitle} 자동 적용(문의 유형 ${result.industryTemplate.createdIntentKeys.length}개)`,
              );
            } else if (result.industryTemplateError) {
              showToast(
                `승인 완료 — 070 배정됨 · 업종 팩 자동 적용 실패(콘솔에서 수동 적용 가능): ${result.industryTemplateError}`,
              );
            } else {
              showToast("승인 완료 — 070 배정됨");
            }
            qc.invalidateQueries({ queryKey: qk.tenants });
          }}
        />
      ) : null}

      {rejectTarget ? (
        <RejectModal
          tenant={rejectTarget}
          onClose={() => setRejectTarget(null)}
          onSuccess={() => {
            setRejectTarget(null);
            showToast("반려 완료 — 사유가 신청자에게 표시돼요");
            qc.invalidateQueries({ queryKey: qk.tenants });
          }}
        />
      ) : null}
    </div>
  );
}

// ── 모달 공통 셸 ─────────────────────────────────────────────────
function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink-900/40 p-4"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="w-full max-w-md rounded-xl bg-white p-6 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mb-4 text-xl font-bold text-ink-900">{title}</h2>
        {children}
      </div>
    </div>
  );
}

// ── 승인 모달: 070 번호 배정 ─────────────────────────────────────
function ApproveModal({
  tenant,
  onClose,
  onSuccess,
}: {
  tenant: TenantAdminListItem;
  onClose: () => void;
  /** 승인 응답 전체를 넘긴다 — 업종 팩 자동 적용 결과를 토스트에 반영(v0.6.0). */
  onSuccess: (result: TenantReviewResult) => void;
}) {
  const [phoneNumber, setPhoneNumber] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const approve = useMutation({
    mutationFn: () =>
      authApi.approveTenant(String(tenant.tenantId), { phoneNumber: phoneNumber.trim() }),
    onSuccess: (result) => onSuccess(result),
    onError: (err) => {
      if (apiErrorCode(err) === "phone_number_taken") {
        setFieldError("이미 다른 사업장에 배정된 번호예요.");
      } else {
        setFieldError(err instanceof Error ? err.message : String(err));
      }
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = phoneNumber.trim();
    if (!isValidPhoneNumber(v)) {
      setFieldError("070 번호는 숫자와 하이픈만, 9~13자리로 입력해 주세요.");
      return;
    }
    setFieldError(null);
    approve.mutate();
  }

  return (
    <ModalShell title={`${tenant.name} 신청 승인`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="block text-[13px] font-semibold text-ink-700">
          배정할 070 번호
          <input
            autoFocus
            className={`mt-1 block w-full rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 ${
              fieldError
                ? "border-danger-600 ring-danger-50"
                : "border-ink-200 focus:border-brand-400 focus:ring-brand-100"
            }`}
            value={phoneNumber}
            onChange={(e) => {
              setPhoneNumber(e.target.value);
              setFieldError(null);
            }}
            placeholder="070-1234-5678"
            inputMode="tel"
          />
        </label>
        {fieldError ? (
          <p className="mt-1.5 text-[13px] text-danger-600">{fieldError}</p>
        ) : null}
        <p className="mt-2 text-[13px] text-ink-500">
          이 번호로 수신되는 전화를 AI 상담원이 받게 됩니다.
        </p>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={approve.isPending}
            className="rounded-lg bg-brand-400 px-4 py-2.5 text-sm font-semibold text-ink-900 hover:bg-brand-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {approve.isPending ? "승인 중…" : "승인하기"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}

// ── 반려 모달: 사유 입력(신청자에게 그대로 노출) ─────────────────
const REJECT_REASON_MAX = 500;

function RejectModal({
  tenant,
  onClose,
  onSuccess,
}: {
  tenant: TenantAdminListItem;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [reason, setReason] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  const reject = useMutation({
    mutationFn: () => authApi.rejectTenant(String(tenant.tenantId), { reason: reason.trim() }),
    onSuccess,
    onError: (err) => {
      setFieldError(err instanceof Error ? err.message : String(err));
    },
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = reason.trim();
    if (v.length < 1 || v.length > REJECT_REASON_MAX) {
      setFieldError("반려 사유를 1~500자로 입력해 주세요.");
      return;
    }
    setFieldError(null);
    reject.mutate();
  }

  return (
    <ModalShell title={`${tenant.name} 신청 반려`} onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <label className="block text-[13px] font-semibold text-ink-700">
          반려 사유
          <textarea
            autoFocus
            rows={4}
            maxLength={REJECT_REASON_MAX}
            className={`mt-1 block w-full resize-none rounded-lg border bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 ${
              fieldError
                ? "border-danger-600 ring-danger-50"
                : "border-ink-200 focus:border-brand-400 focus:ring-brand-100"
            }`}
            value={reason}
            onChange={(e) => {
              setReason(e.target.value);
              setFieldError(null);
            }}
            placeholder="예: 사업장 연락처로 확인이 어려워 승인하지 못했어요. 연락 가능한 번호로 문의해 주세요."
          />
        </label>
        <div className="mt-1 flex items-start justify-between gap-3">
          {fieldError ? (
            <p className="text-[13px] text-danger-600">{fieldError}</p>
          ) : (
            <p className="text-[13px] text-ink-500">
              이 문구가 신청자에게 그대로 보여집니다. 사용자에게 보내는 문장으로 써
              주세요.
            </p>
          )}
          <span className="shrink-0 text-xs text-ink-400">
            {reason.length}/{REJECT_REASON_MAX}
          </span>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-ink-200 bg-white px-4 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50"
          >
            취소
          </button>
          <button
            type="submit"
            disabled={reject.isPending}
            className="rounded-lg bg-danger-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-danger-700 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {reject.isPending ? "반려 중…" : "반려하기"}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
