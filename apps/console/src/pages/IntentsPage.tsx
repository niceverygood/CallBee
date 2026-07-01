import { useState } from "react";
import { SYSTEM_TOOL_NAMES } from "@colli/contracts";
import type { TenantIntentDefinition } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import {
  useIntents,
  useCreateIntent,
  useUpdateIntent,
  useDeleteIntent,
  useTools,
} from "../api/hooks";
import type { TenantIntentDraft } from "../api/types";
import { FormField, inputCls } from "../components/FormField";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { Badge } from "../components/Badge";
import { parseCsv, toCsv } from "../lib/format";

const NO_ROUTING = "__none__";

const emptyDraft = (nextSortOrder: number): TenantIntentDraft => ({
  key: "",
  label: "",
  keywords: [],
  routingToolName: null,
  sortOrder: nextSortOrder,
  enabled: true,
});

/**
 * (b) 의도 카탈로그 탭 — TenantIntent 목록 테이블(key/label/keywords/
 * routingToolName/sortOrder/enabled), 추가/수정/삭제. routingToolName 은
 * SYSTEM_TOOL_NAMES(드롭다운) 또는 해당 테넌트의 TenantTool.name 중 선택.
 */
export function IntentsPage() {
  const tenantId = useTenantId();
  const { data, isLoading, error } = useIntents(tenantId);
  const { data: tools } = useTools(tenantId);
  const create = useCreateIntent(tenantId);
  const update = useUpdateIntent(tenantId);
  const remove = useDeleteIntent(tenantId);

  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [draft, setDraft] = useState<TenantIntentDraft>(emptyDraft(0));

  const startNew = () => {
    const nextSortOrder = (data ?? []).length;
    setEditingKey("__new__");
    setDraft(emptyDraft(nextSortOrder));
  };
  const startEdit = (intent: TenantIntentDefinition) => {
    setEditingKey(String(intent.key));
    setDraft({
      key: intent.key,
      label: intent.label,
      keywords: [...intent.keywords],
      routingToolName: intent.routingToolName,
      sortOrder: intent.sortOrder,
      enabled: intent.enabled,
    });
  };
  const cancel = () => setEditingKey(null);
  const save = () => {
    if (editingKey === "__new__") {
      create.mutate(draft, { onSuccess: () => setEditingKey(null) });
    } else if (editingKey) {
      update.mutate(
        { intentId: editingKey, draft },
        { onSuccess: () => setEditingKey(null) },
      );
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={startNew}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + 의도 추가
        </button>
      </div>

      {editingKey ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {editingKey === "__new__" ? "새 의도" : "의도 편집"}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="key" hint="테넌트 스코프 유일 slug">
              <input
                className={inputCls}
                value={String(draft.key)}
                disabled={editingKey !== "__new__"}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="예: reservation"
              />
            </FormField>
            <FormField label="label">
              <input
                className={inputCls}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="예: 예약 문의"
              />
            </FormField>
            <FormField label="keywords (쉼표 구분)">
              <input
                className={inputCls}
                value={toCsv(draft.keywords)}
                onChange={(e) =>
                  setDraft({ ...draft, keywords: parseCsv(e.target.value) })
                }
              />
            </FormField>
            <FormField label="routingToolName">
              <select
                className={inputCls}
                value={draft.routingToolName ?? NO_ROUTING}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    routingToolName:
                      e.target.value === NO_ROUTING ? null : e.target.value,
                  })
                }
              >
                <option value={NO_ROUTING}>(없음 — 기본 KB 폴백)</option>
                <optgroup label="시스템 tool">
                  {SYSTEM_TOOL_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
                {tools && tools.length > 0 ? (
                  <optgroup label="커스텀 tool">
                    {tools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </FormField>
            <FormField label="sortOrder">
              <input
                type="number"
                className={inputCls}
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })
                }
              />
            </FormField>
            <FormField label="enabled">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                활성화
              </label>
            </FormField>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={
                create.isPending || update.isPending || !draft.label.trim() || !String(draft.key).trim()
              }
              className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
            >
              저장
            </button>
            <button
              onClick={cancel}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
            >
              취소
            </button>
          </div>
        </div>
      ) : null}

      {data && data.length === 0 ? (
        <EmptyBlock label="등록된 의도가 없습니다." />
      ) : null}

      {data && data.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs font-semibold text-slate-500">
              <tr>
                <th className="px-4 py-2">key</th>
                <th className="px-4 py-2">label</th>
                <th className="px-4 py-2">keywords</th>
                <th className="px-4 py-2">routingToolName</th>
                <th className="px-4 py-2">sortOrder</th>
                <th className="px-4 py-2">enabled</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((intent) => (
                  <tr key={String(intent.key)} className="border-t border-slate-100">
                    <td className="px-4 py-2 font-mono text-xs">{String(intent.key)}</td>
                    <td className="px-4 py-2">{intent.label}</td>
                    <td className="px-4 py-2">
                      <div className="flex flex-wrap gap-1">
                        {intent.keywords.map((k) => (
                          <Badge key={k}>{k}</Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-2 font-mono text-xs">
                      {intent.routingToolName ?? "—"}
                    </td>
                    <td className="px-4 py-2">{intent.sortOrder}</td>
                    <td className="px-4 py-2">
                      {intent.enabled ? (
                        <Badge tone="bg-green-100 text-green-700">활성</Badge>
                      ) : (
                        <Badge tone="bg-slate-100 text-slate-500">비활성</Badge>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <div className="flex gap-2">
                        <button
                          onClick={() => startEdit(intent)}
                          className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                        >
                          편집
                        </button>
                        <button
                          onClick={() => remove.mutate(String(intent.key))}
                          className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                        >
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </div>
  );
}
