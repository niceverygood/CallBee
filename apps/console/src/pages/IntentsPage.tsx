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
import { PageHeader } from "../components/PageHeader";
import { btnPrimary, btnSecondary, btnSmall, btnSmallDanger } from "../components/ui";
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
 * 에이전트 스튜디오 > 문의 유형 — 예약, 영업시간 문의처럼 자주 오는 전화
 * 유형을 등록/수정/삭제한다(내부 계약은 TenantIntent — 사용자 노출 용어는
 * brand-guide §5 에 따라 "문의 유형").
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
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="문의 유형"
        subtitle="예약, 영업시간 문의처럼 자주 오는 전화 유형을 등록해 주세요."
        actions={
          <button onClick={startNew} className={btnPrimary}>
            + 문의 유형 추가
          </button>
        }
      />

      {editingKey ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink-800">
            {editingKey === "__new__" ? "새 문의 유형" : "문의 유형 편집"}
          </h2>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField label="구분 값" hint="영문 소문자 slug — 한 번 정하면 바꾸지 않는 게 좋아요.">
              <input
                className={inputCls}
                value={String(draft.key)}
                disabled={editingKey !== "__new__"}
                onChange={(e) => setDraft({ ...draft, key: e.target.value })}
                placeholder="예: reservation"
              />
            </FormField>
            <FormField label="이름">
              <input
                className={inputCls}
                value={draft.label}
                onChange={(e) => setDraft({ ...draft, label: e.target.value })}
                placeholder="예: 예약 문의"
              />
            </FormField>
            <FormField label="인식 키워드" hint="쉼표로 구분해 입력해요.">
              <input
                className={inputCls}
                value={toCsv(draft.keywords)}
                onChange={(e) =>
                  setDraft({ ...draft, keywords: parseCsv(e.target.value) })
                }
                placeholder="예: 예약, 자리, 몇 명"
              />
            </FormField>
            <FormField label="처리 방법" hint="이 문의가 오면 실행할 동작이에요.">
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
                <option value={NO_ROUTING}>(기본 — 자주 묻는 질문에서 답변)</option>
                <optgroup label="기본 동작">
                  {SYSTEM_TOOL_NAMES.map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </optgroup>
                {tools && tools.length > 0 ? (
                  <optgroup label="내 연동">
                    {tools.map((t) => (
                      <option key={t.name} value={t.name}>
                        {t.name}
                      </option>
                    ))}
                  </optgroup>
                ) : null}
              </select>
            </FormField>
            <FormField label="표시 순서">
              <input
                type="number"
                className={inputCls}
                value={draft.sortOrder}
                onChange={(e) =>
                  setDraft({ ...draft, sortOrder: Number(e.target.value) || 0 })
                }
              />
            </FormField>
            <FormField label="사용 여부">
              <label className="flex items-center gap-2 py-2.5 text-sm text-ink-700">
                <input
                  type="checkbox"
                  className="h-4 w-4 accent-brand-500"
                  checked={draft.enabled}
                  onChange={(e) => setDraft({ ...draft, enabled: e.target.checked })}
                />
                사용해요
              </label>
            </FormField>
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button onClick={cancel} className={btnSecondary}>
              취소
            </button>
            <button
              onClick={save}
              disabled={
                create.isPending ||
                update.isPending ||
                !draft.label.trim() ||
                !String(draft.key).trim()
              }
              className={btnPrimary}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {data && data.length === 0 && !editingKey ? (
        <EmptyBlock label="아직 등록한 문의 유형이 없어요. 자주 오는 전화 유형부터 등록해 보세요.">
          <button onClick={startNew} className={btnSecondary}>
            첫 문의 유형 만들기
          </button>
        </EmptyBlock>
      ) : null}

      {data && data.length > 0 ? (
        <div className="overflow-hidden rounded-xl border border-ink-200 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-ink-200 text-left text-[13px] font-semibold text-ink-500">
                <th className="px-4 py-3">이름</th>
                <th className="px-4 py-3">인식 키워드</th>
                <th className="hidden px-4 py-3 md:table-cell">처리 방법</th>
                <th className="px-4 py-3">상태</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {[...data]
                .sort((a, b) => a.sortOrder - b.sortOrder)
                .map((intent) => (
                  <tr
                    key={String(intent.key)}
                    className="border-b border-ink-100 last:border-b-0 hover:bg-ink-50"
                  >
                    <td className="px-4 py-3.5">
                      <div className="font-medium text-ink-900">{intent.label}</div>
                      <div className="font-mono text-xs text-ink-400">
                        {String(intent.key)}
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex flex-wrap gap-1">
                        {intent.keywords.length > 0 ? (
                          intent.keywords.map((k) => <Badge key={k}>{k}</Badge>)
                        ) : (
                          <span className="text-ink-400">—</span>
                        )}
                      </div>
                    </td>
                    <td className="hidden px-4 py-3.5 font-mono text-xs text-ink-600 md:table-cell">
                      {intent.routingToolName ?? "—"}
                    </td>
                    <td className="px-4 py-3.5">
                      {intent.enabled ? (
                        <Badge tone="bg-success-50 text-success-700">사용 중</Badge>
                      ) : (
                        <Badge>꺼짐</Badge>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex justify-end gap-2">
                        <button onClick={() => startEdit(intent)} className={btnSmall}>
                          편집
                        </button>
                        <button
                          onClick={() => remove.mutate(String(intent.key))}
                          className={btnSmallDanger}
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
