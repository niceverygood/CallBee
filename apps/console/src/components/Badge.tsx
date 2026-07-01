import type { ReactNode } from "react";

export function Badge({
  children,
  tone = "bg-slate-100 text-slate-700",
}: {
  children: ReactNode;
  tone?: string;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${tone}`}
    >
      {children}
    </span>
  );
}
