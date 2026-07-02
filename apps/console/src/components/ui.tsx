/**
 * 콜비 공용 UI 프리미티브 — /docs/brand-guide.md §4 컴포넌트 원칙의 단일 구현.
 * radius 3단(입력·버튼 rounded-lg / 카드·모달 rounded-xl / 뱃지·칩 rounded-full),
 * 그림자 2단(카드 shadow-sm / 모달 shadow-lg), 포커스 ring-brand-400.
 * Primary 버튼은 brand-400 배경 + ink-900 텍스트(흰 텍스트 금지 — 꿀벌 대비 원칙).
 */
import type { ReactNode } from "react";

const btnBase =
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40";

export const btnPrimary = `${btnBase} bg-brand-400 px-4 py-2.5 font-semibold text-ink-900 hover:bg-brand-500 active:bg-brand-600`;

export const btnSecondary = `${btnBase} border border-ink-200 bg-white px-4 py-2.5 font-medium text-ink-700 hover:bg-ink-50`;

export const btnGhost = `${btnBase} px-3 py-2 font-medium text-ink-600 hover:bg-ink-100 hover:text-ink-900`;

export const btnDanger = `${btnBase} bg-danger-600 px-4 py-2.5 font-semibold text-white hover:bg-danger-700`;

/** 작은 보조 버튼(테이블 행 액션 등) */
export const btnSmall =
  "rounded-lg border border-ink-200 bg-white px-2.5 py-1 text-xs font-medium text-ink-600 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1";

export const btnSmallDanger =
  "rounded-lg border border-danger-600/30 bg-white px-2.5 py-1 text-xs font-medium text-danger-600 hover:bg-danger-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1";

export function Card({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`rounded-xl border border-ink-200 bg-white p-6 ${className}`}>
      {children}
    </section>
  );
}

/** 카드 헤더(H2 + 우측 액션) */
export function CardHeader({
  title,
  description,
  actions,
}: {
  title: string;
  description?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-5 flex items-start justify-between gap-4">
      <div>
        <h2 className="text-xl font-bold text-ink-900">{title}</h2>
        {description ? <p className="mt-1 text-[13px] text-ink-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 gap-2">{actions}</div> : null}
    </div>
  );
}

/**
 * 꿀벌 마크 — v1 로고(brand-guide §7): 원 2개+날개의 단순 2색 SVG.
 * 외부 에셋 의존 금지 원칙에 따라 인라인으로 둔다.
 */
export function BeeMark({ size = 28 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* 날개 */}
      <ellipse cx="13" cy="8.5" rx="5" ry="3.6" fill="#FFE08A" transform="rotate(-24 13 8.5)" />
      <ellipse cx="21" cy="8.5" rx="5" ry="3.6" fill="#FFEFC7" transform="rotate(24 21 8.5)" />
      {/* 몸통 */}
      <circle cx="17" cy="18" r="9" fill="#FFB820" />
      {/* 줄무늬 */}
      <path d="M12.2 11.5c-2 1.6-3.2 4-3.2 6.5h5.4l-2.2-6.5z" fill="none" />
      <rect x="13.4" y="9.6" width="2.8" height="17" rx="1.4" fill="#191F28" transform="rotate(0 0 0)" />
      <rect x="19" y="10.4" width="2.8" height="15.5" rx="1.4" fill="#191F28" />
      {/* 머리 */}
      <circle cx="8.6" cy="18" r="3.6" fill="#191F28" />
    </svg>
  );
}

/** 텍스트 로고(꿀벌 마크 + "콜비") */
export function Logo({ size = "base" }: { size?: "base" | "lg" }) {
  return (
    <span className="inline-flex items-center gap-2">
      <BeeMark size={size === "lg" ? 32 : 26} />
      <span
        className={`font-extrabold text-ink-900 ${
          size === "lg" ? "text-2xl" : "text-lg"
        }`}
      >
        콜비
      </span>
    </span>
  );
}
