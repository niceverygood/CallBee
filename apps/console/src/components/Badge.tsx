import type { ReactNode } from "react";
import type { TenantStatus } from "@colli/contracts";
import { TENANT_STATUS_LABELS } from "@colli/contracts";

/**
 * 뱃지 — brand-guide §4.4: rounded-full + "배경 50 + 텍스트 700" 조합 고정.
 */
export function Badge({
  children,
  tone = "bg-ink-100 text-ink-600",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${tone}`}
    >
      {children}
    </span>
  );
}

/** 사업장 상태별 뱃지 톤(§4.4 표 고정 조합) */
export const STATUS_BADGE_TONES: Record<TenantStatus, string> = {
  active: "bg-success-50 text-success-700",
  pending_approval: "bg-warn-50 text-warn-700",
  rejected: "bg-danger-50 text-danger-700",
  onboarding: "bg-info-50 text-info-600",
  suspended: "bg-ink-100 text-ink-600",
};

export function StatusBadge({ status }: { status: TenantStatus }) {
  return <Badge tone={STATUS_BADGE_TONES[status]}>{TENANT_STATUS_LABELS[status]}</Badge>;
}
