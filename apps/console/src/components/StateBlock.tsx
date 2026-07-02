import type { ReactNode } from "react";

export function Loading({ label = "불러오는 중…" }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 py-8 text-sm text-ink-500">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-ink-200 border-t-brand-500" />
      {label}
    </div>
  );
}

export function ErrorBlock({ error }: { error: unknown }) {
  const msg = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-xl border border-danger-600/20 bg-danger-50 p-4 text-sm text-danger-700">
      데이터를 불러오지 못했어요: {msg}
    </div>
  );
}

/** 빈 상태 — 절제된 꿀벌 모티프 + 1줄 설명(+ 보조 CTA) */
export function EmptyBlock({ label, children }: { label: string; children?: ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-ink-300 bg-white p-10 text-center">
      <div className="text-3xl" aria-hidden="true">
        🐝
      </div>
      <p className="mt-3 text-sm text-ink-500">{label}</p>
      {children ? <div className="mt-4">{children}</div> : null}
    </div>
  );
}
