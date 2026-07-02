import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { isPhoneNumberAssigned, TENANT_PLAN_METAS } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTenant, useUpdateTenant } from "../api/hooks";
import { useSession } from "../lib/useSession";
import { FormField, inputCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { Badge, StatusBadge } from "../components/Badge";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 운영 설정 > 사업장 정보 — product-spec §4.10.
 * 사업장 이름(수정 가능) / 업종 라벨 / 070 번호(읽기 전용, 미배정 표시) /
 * 요금제 카드(표시 전용) / 계정 이메일.
 */
export function BusinessInfoPage() {
  const tenantId = useTenantId();
  const session = useSession();
  const { data: tenant, isLoading, error } = useTenant(tenantId);
  const update = useUpdateTenant(tenantId);

  const [name, setName] = useState("");
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (tenant) setName(tenant.name);
  }, [tenant]);

  if (isLoading) return <Loading />;
  if (error || !tenant) return <ErrorBlock error={error ?? new Error("불러오지 못했어요")} />;

  const assigned = isPhoneNumberAssigned(tenant.phoneNumber);
  const planMeta = TENANT_PLAN_METAS[tenant.plan];
  const trimmed = name.trim();
  const invalid = trimmed.length < 1 || trimmed.length > 60;

  const onSave = () =>
    update.mutate({ name: trimmed }, { onSuccess: () => setSavedAt(Date.now()) });

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader title="사업장 정보" subtitle="사업장 기본 정보와 요금제를 확인해요." />

      <div className="space-y-4">
        <Card className="space-y-4">
          <FormField label="사업장 이름" error={invalid ? "사업장 이름을 입력해 주세요" : null}>
            <input
              className={inputCls}
              value={name}
              maxLength={60}
              onChange={(e) => {
                setName(e.target.value);
                setSavedAt(null);
              }}
            />
          </FormField>

          <div className="grid gap-4 sm:grid-cols-2">
            <ReadOnlyField label="업종">{tenant.industryLabel ?? "미지정"}</ReadOnlyField>
            <ReadOnlyField label="070 번호">
              {assigned ? (
                tenant.phoneNumber
              ) : (
                <span className="flex items-center gap-2">
                  미배정 <Badge tone="bg-warn-50 text-warn-700">배정 대기</Badge>
                </span>
              )}
            </ReadOnlyField>
            <ReadOnlyField label="상태">
              <StatusBadge status={tenant.status} />
            </ReadOnlyField>
            <ReadOnlyField label="계정 이메일">
              {session?.account.email ?? "데모 계정"}
            </ReadOnlyField>
          </div>

          <SaveBar
            onSave={onSave}
            saving={update.isPending}
            savedAt={savedAt}
            error={update.isError ? update.error : null}
            disabled={invalid}
          />
        </Card>

        <Card>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-2 text-base font-semibold text-ink-900">
                요금제
                {planMeta.recommended ? (
                  <Badge tone="bg-brand-100 text-brand-800">가장 인기</Badge>
                ) : null}
              </h2>
              <p className="mt-2 text-2xl font-bold text-ink-900">
                {planMeta.name}{" "}
                <span className="text-base font-semibold text-ink-500">
                  · {planMeta.priceLabel}
                </span>
              </p>
              <p className="mt-1 text-[13px] text-ink-500">{planMeta.description}</p>
            </div>
          </div>
          <ul className="mt-4 grid gap-1.5 sm:grid-cols-2">
            {planMeta.features.map((f) => (
              <li key={f} className="flex gap-2 text-[13px] text-ink-700">
                <span aria-hidden="true" className="font-semibold text-brand-600">
                  ✓
                </span>
                {f}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-ink-100 pt-4 text-[13px] text-ink-500">
            요금제 변경은 문의해 주세요. 지금은 결제 정보를 받지 않아요.
          </p>
        </Card>
      </div>
    </div>
  );
}

function ReadOnlyField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <div className="text-[13px] font-semibold text-ink-700">{label}</div>
      <div className="mt-1.5 flex min-h-[2.75rem] items-center rounded-lg bg-ink-50 px-3.5 text-sm text-ink-700">
        {children}
      </div>
    </div>
  );
}
