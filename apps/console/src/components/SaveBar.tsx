import { btnPrimary } from "./ui";

/**
 * 설정 화면 공용 저장 바 — Primary 버튼(화면당 1개 원칙) + 저장 완료/실패 캡션.
 * 로딩 중에도 라벨 유지("저장 중…"), 버튼 폭 점프 방지를 위해 min-w 고정.
 */
export function SaveBar({
  onSave,
  saving,
  savedAt,
  error,
  disabled,
  label = "저장하기",
}: {
  onSave: () => void;
  saving: boolean;
  savedAt: number | null;
  error: unknown;
  disabled?: boolean;
  label?: string;
}) {
  return (
    <div className="flex items-center gap-3 pt-2">
      <button
        type="button"
        onClick={onSave}
        disabled={saving || disabled}
        className={`${btnPrimary} min-w-[7.5rem]`}
      >
        {saving ? "저장 중…" : label}
      </button>
      {savedAt ? (
        <span className="text-[13px] font-medium text-success-600">저장했어요.</span>
      ) : null}
      {error ? (
        <span className="text-[13px] text-danger-600">
          저장하지 못했어요. 잠시 후 다시 시도해 주세요.
        </span>
      ) : null}
    </div>
  );
}
