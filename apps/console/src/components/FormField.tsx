import type { ReactNode } from "react";

/**
 * 폼 필드 래퍼 — brand-guide §4.2: 라벨은 입력 위(Label 스타일),
 * 힌트/에러는 아래 Caption. 에러 문구는 danger-600 텍스트만(아이콘 없음).
 */
export function FormField({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: string;
  error?: string | null;
  children: ReactNode;
}) {
  return (
    <label className="block text-[13px] font-semibold text-ink-700">
      {label}
      <div className="mt-1.5">{children}</div>
      {error ? (
        <p className="mt-1.5 text-[13px] font-normal text-danger-600">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-[13px] font-normal text-ink-500">{hint}</p>
      ) : null}
    </label>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 hover:border-ink-300 focus:border-brand-400 focus:outline-none focus:ring-2 focus:ring-brand-100 disabled:bg-ink-100 disabled:text-ink-400";

export const inputErrorCls =
  "block w-full rounded-lg border border-danger-600 bg-white px-3.5 py-2.5 text-sm text-ink-900 placeholder:text-ink-400 focus:outline-none focus:ring-2 focus:ring-danger-50";

export const textareaCls = inputCls;
