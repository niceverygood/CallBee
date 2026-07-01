import type { ReactNode } from "react";

export function FormField({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  return (
    <label className="block text-xs font-medium text-slate-500">
      {label}
      <div className="mt-1">{children}</div>
      {hint ? <p className="mt-1 text-[11px] font-normal text-slate-400">{hint}</p> : null}
    </label>
  );
}

export const inputCls =
  "block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none";

export const textareaCls = inputCls;
