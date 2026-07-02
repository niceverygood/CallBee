import { useState } from "react";
import type { KeyboardEvent } from "react";
import { inputCls } from "./FormField";

/**
 * 칩(chip) 입력 — 긴급 키워드 등 짧은 문자열 배열 편집용(brand-guide §4:
 * 뱃지·칩은 rounded-full). Enter 또는 "추가" 버튼으로 등록, 칩의 × 로 삭제.
 */
export function ChipsInput({
  values,
  onChange,
  placeholder,
  maxItems,
  maxLength,
}: {
  values: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  maxItems?: number;
  maxLength?: number;
}) {
  const [text, setText] = useState("");

  const add = () => {
    const v = text.trim();
    if (!v) return;
    if (maxLength && v.length > maxLength) return;
    if (maxItems && values.length >= maxItems) return;
    if (values.includes(v)) {
      setText("");
      return;
    }
    onChange([...values, v]);
    setText("");
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      add();
    }
  };

  return (
    <div>
      <div className="flex gap-2">
        <input
          className={inputCls}
          value={text}
          maxLength={maxLength}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
        />
        <button
          type="button"
          onClick={add}
          disabled={!text.trim() || (maxItems ? values.length >= maxItems : false)}
          className="shrink-0 rounded-lg border border-ink-200 bg-white px-3.5 py-2.5 text-sm font-medium text-ink-700 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-40"
        >
          추가
        </button>
      </div>
      {values.length > 0 ? (
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          {values.map((v) => (
            <span
              key={v}
              className="inline-flex items-center gap-1 rounded-full bg-brand-100 px-2.5 py-0.5 text-xs font-semibold text-brand-800"
            >
              {v}
              <button
                type="button"
                aria-label={`${v} 삭제`}
                onClick={() => onChange(values.filter((x) => x !== v))}
                className="text-brand-800/70 hover:text-brand-800"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
