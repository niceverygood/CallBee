import { useState } from "react";
import type { FormEvent } from "react";
import { useSubmitOnboarding } from "../api/hooks";
import type { OnboardingDraft, OnboardingResult } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { FormField, inputCls } from "../components/FormField";

const emptyDraft = (): OnboardingDraft => ({
  companyName: "",
  industryLabel: "",
  ownerEmail: "",
  requestedPhoneNumber: "",
});

export function OnboardingPage() {
  const [draft, setDraft] = useState<OnboardingDraft>(emptyDraft());
  const [result, setResult] = useState<OnboardingResult | null>(null);
  const submit = useSubmitOnboarding();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit.mutate(draft, {
      onSuccess: (res) => {
        setResult(res);
        setDraft(emptyDraft());
      },
    });
  };

  return (
    <div>
      <PageHeader
        title="온보딩"
        subtitle="업체명·업종·070 번호를 신청하면 새 테넌트가 생성됩니다 (목 데이터)."
      />

      <form
        onSubmit={onSubmit}
        className="max-w-lg space-y-4 rounded-xl border border-slate-200 bg-white p-6"
      >
        <FormField label="업체명">
          <input
            required
            className={inputCls}
            value={draft.companyName}
            onChange={(e) => setDraft({ ...draft, companyName: e.target.value })}
            placeholder="예: 우리동네 김밥집"
          />
        </FormField>
        <FormField label="업종" hint="자유 텍스트 메모(강제 카탈로그 아님)">
          <input
            className={inputCls}
            value={draft.industryLabel}
            onChange={(e) => setDraft({ ...draft, industryLabel: e.target.value })}
            placeholder="예: 식당, 병원, 미용실"
          />
        </FormField>
        <FormField label="담당자 이메일">
          <input
            type="email"
            required
            className={inputCls}
            value={draft.ownerEmail}
            onChange={(e) => setDraft({ ...draft, ownerEmail: e.target.value })}
            placeholder="owner@example.com"
          />
        </FormField>
        <FormField label="신청 070 번호" hint="실제 발급은 검토 후 진행됩니다(목 데이터)">
          <input
            required
            className={inputCls}
            value={draft.requestedPhoneNumber}
            onChange={(e) =>
              setDraft({ ...draft, requestedPhoneNumber: e.target.value })
            }
            placeholder="07000000000"
          />
        </FormField>

        <button
          type="submit"
          disabled={submit.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submit.isPending ? "신청 중…" : "온보딩 신청"}
        </button>

        {submit.isError ? (
          <p className="text-sm text-red-600">
            신청 실패:{" "}
            {submit.error instanceof Error ? submit.error.message : String(submit.error)}
          </p>
        ) : null}
      </form>

      {result ? (
        <div className="mt-6 max-w-lg rounded-xl border border-green-200 bg-green-50 p-4 text-sm text-green-800">
          <p className="font-semibold">{result.message}</p>
          <dl className="mt-2 space-y-1 text-green-700">
            <div>
              <dt className="inline font-medium">테넌트 ID: </dt>
              <dd className="inline">{String(result.tenant.tenantId)}</dd>
            </div>
            <div>
              <dt className="inline font-medium">상태: </dt>
              <dd className="inline">{result.tenant.status}</dd>
            </div>
          </dl>
        </div>
      ) : null}
    </div>
  );
}
