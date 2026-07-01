import { useMemo, useState } from "react";
import { useTenantId } from "../lib/tenant";
import { useKb, useCreateKb, useUpdateKb, useDeleteKb, useIntents } from "../api/hooks";
import type { KnowledgeItem, KnowledgeItemDraft } from "../api/types";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { formatDateTime, parseCsv, toCsv } from "../lib/format";

const emptyDraft = (): KnowledgeItemDraft => ({
  category: "",
  question: "",
  answer: "",
  tags: [],
});

/**
 * 에이전트 스튜디오 — KB(FAQ) 편집기. 카테고리는 테넌트 의도 카탈로그의
 * key 중에서 선택(고정 enum 이 아니라 자유 정의된 TenantIntentKey 사용).
 */
export function KnowledgeBasePage() {
  const tenantId = useTenantId();
  const { data, isLoading, error } = useKb(tenantId);
  const { data: intents } = useIntents(tenantId);
  const create = useCreateKb(tenantId);
  const update = useUpdateKb(tenantId);
  const remove = useDeleteKb(tenantId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KnowledgeItemDraft>(emptyDraft());
  const [filter, setFilter] = useState<string>("all");

  const categoryOptions = useMemo(
    () => (intents ?? []).map((i) => ({ key: String(i.key), label: i.label })),
    [intents],
  );

  const grouped = useMemo(() => {
    const items = (data ?? []).filter((k) => filter === "all" || k.category === filter);
    const map = new Map<string, KnowledgeItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return map;
  }, [data, filter]);

  const labelFor = (category: string) =>
    categoryOptions.find((c) => c.key === category)?.label ?? category;

  const startNew = () => {
    setEditingId("__new__");
    setDraft(emptyDraft());
  };
  const startEdit = (k: KnowledgeItem) => {
    setEditingId(String(k.id));
    setDraft({ category: k.category, question: k.question, answer: k.answer, tags: [...k.tags] });
  };
  const cancel = () => setEditingId(null);
  const save = () => {
    if (editingId === "__new__") {
      create.mutate(draft, { onSuccess: () => setEditingId(null) });
    } else if (editingId) {
      update.mutate({ id: editingId, patch: draft }, { onSuccess: () => setEditingId(null) });
    }
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div>
      <div className="mb-4 flex items-end justify-between">
        <label className="text-xs font-medium text-slate-500">
          카테고리 필터
          <select
            className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option value="all">전체</option>
            {categoryOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
        </label>
        <button
          onClick={startNew}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + 새 항목
        </button>
      </div>

      {editingId ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {editingId === "__new__" ? "새 FAQ" : "FAQ 편집"}
          </h2>
          <div className="grid gap-3">
            <FormField label="카테고리">
              <select
                className={inputCls}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                <option value="">선택</option>
                {categoryOptions.map((c) => (
                  <option key={c.key} value={c.key}>
                    {c.label}
                  </option>
                ))}
              </select>
            </FormField>
            <FormField label="질문">
              <input
                className={inputCls}
                value={draft.question}
                onChange={(e) => setDraft({ ...draft, question: e.target.value })}
              />
            </FormField>
            <FormField label="답변">
              <textarea
                rows={3}
                className={textareaCls}
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              />
            </FormField>
            <FormField label="태그 (쉼표 구분)">
              <input
                className={inputCls}
                value={toCsv(draft.tags)}
                onChange={(e) => setDraft({ ...draft, tags: parseCsv(e.target.value) })}
              />
            </FormField>
          </div>
          <div className="mt-3 flex gap-2">
            <button
              onClick={save}
              disabled={create.isPending || update.isPending || !draft.question.trim() || !draft.answer.trim()}
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

      {data && grouped.size === 0 ? <EmptyBlock label="등록된 FAQ 가 없습니다." /> : null}

      <div className="space-y-6">
        {[...grouped.entries()].map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">
              {labelFor(cat)} <span className="text-slate-400">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map((k) => (
                <article key={String(k.id)} className="rounded-xl border border-slate-200 bg-white p-4">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">{k.question}</h3>
                      <p className="mt-1 text-sm text-slate-600">{k.answer}</p>
                      <div className="mt-2 flex flex-wrap gap-1">
                        {k.tags.map((t) => (
                          <Badge key={t} tone="bg-brand-50 text-brand-700">
                            #{t}
                          </Badge>
                        ))}
                      </div>
                      <div className="mt-2 text-xs text-slate-400">
                        수정: {formatDateTime(k.updatedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() => startEdit(k)}
                        className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                      >
                        편집
                      </button>
                      <button
                        onClick={() => remove.mutate(String(k.id))}
                        className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
                      >
                        삭제
                      </button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
