import { useMemo, useState } from "react";
import { INTENTS } from "@colli/contracts";
import type { TicketCategory } from "@colli/contracts";
import { useKb, useCreateKb, useUpdateKb, useDeleteKb } from "../api/hooks";
import type { KnowledgeItem, KnowledgeItemDraft } from "../api/types";
import { PageHeader } from "../components/PageHeader";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { intentLabel, formatDateTime } from "../lib/labels";

const emptyDraft = (): KnowledgeItemDraft => ({
  category: "usage",
  question: "",
  answer: "",
  tags: [],
});

export function KnowledgeBasePage() {
  const { data, isLoading, error } = useKb();
  const create = useCreateKb();
  const update = useUpdateKb();
  const remove = useDeleteKb();

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<KnowledgeItemDraft>(emptyDraft());
  const [filter, setFilter] = useState<TicketCategory | "all">("all");

  const grouped = useMemo(() => {
    const items = (data ?? []).filter(
      (k) => filter === "all" || k.category === filter,
    );
    const map = new Map<TicketCategory, KnowledgeItem[]>();
    for (const it of items) {
      const arr = map.get(it.category) ?? [];
      arr.push(it);
      map.set(it.category, arr);
    }
    return map;
  }, [data, filter]);

  const startNew = () => {
    setEditingId("__new__");
    setDraft(emptyDraft());
  };
  const startEdit = (k: KnowledgeItem) => {
    setEditingId(String(k.id));
    setDraft({
      category: k.category,
      question: k.question,
      answer: k.answer,
      tags: [...k.tags],
    });
  };
  const cancel = () => setEditingId(null);
  const save = () => {
    if (editingId === "__new__") {
      create.mutate(draft, { onSuccess: () => setEditingId(null) });
    } else if (editingId) {
      update.mutate(
        { id: editingId, patch: draft },
        { onSuccess: () => setEditingId(null) },
      );
    }
  };

  return (
    <div>
      <PageHeader
        title="지식베이스"
        subtitle="카테고리별 FAQ 편집"
        actions={
          <button
            onClick={startNew}
            className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
          >
            + 새 항목
          </button>
        }
      />

      <div className="mb-4">
        <label className="text-xs font-medium text-slate-500">
          카테고리 필터
          <select
            className="ml-2 rounded-lg border border-slate-300 bg-white px-2 py-1 text-sm"
            value={filter}
            onChange={(e) => setFilter(e.target.value as TicketCategory | "all")}
          >
            <option value="all">전체</option>
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {intentLabel(i)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {editingId ? (
        <KbEditor
          draft={draft}
          setDraft={setDraft}
          onSave={save}
          onCancel={cancel}
          isNew={editingId === "__new__"}
          busy={create.isPending || update.isPending}
        />
      ) : null}

      {isLoading ? <Loading /> : null}
      {error ? <ErrorBlock error={error} /> : null}
      {data && grouped.size === 0 ? (
        <EmptyBlock label="등록된 FAQ 가 없습니다." />
      ) : null}

      <div className="space-y-6">
        {[...grouped.entries()].map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-sm font-semibold text-slate-600">
              {intentLabel(cat)}{" "}
              <span className="text-slate-400">({items.length})</span>
            </h2>
            <div className="space-y-2">
              {items.map((k) => (
                <article
                  key={String(k.id)}
                  className="rounded-xl border border-slate-200 bg-white p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-800">
                        {k.question}
                      </h3>
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

function KbEditor({
  draft,
  setDraft,
  onSave,
  onCancel,
  isNew,
  busy,
}: {
  draft: KnowledgeItemDraft;
  setDraft: (d: KnowledgeItemDraft) => void;
  onSave: () => void;
  onCancel: () => void;
  isNew: boolean;
  busy: boolean;
}) {
  return (
    <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
      <h2 className="mb-3 text-sm font-semibold text-slate-700">
        {isNew ? "새 FAQ" : "FAQ 편집"}
      </h2>
      <div className="grid gap-3">
        <label className="text-xs font-medium text-slate-500">
          카테고리
          <select
            className="mt-1 block w-full rounded-lg border border-slate-300 px-2 py-1.5 text-sm"
            value={draft.category}
            onChange={(e) =>
              setDraft({ ...draft, category: e.target.value as TicketCategory })
            }
          >
            {INTENTS.map((i) => (
              <option key={i} value={i}>
                {intentLabel(i)}
              </option>
            ))}
          </select>
        </label>
        <label className="text-xs font-medium text-slate-500">
          질문
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={draft.question}
            onChange={(e) => setDraft({ ...draft, question: e.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          답변
          <textarea
            rows={3}
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={draft.answer}
            onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
          />
        </label>
        <label className="text-xs font-medium text-slate-500">
          태그 (쉼표 구분)
          <input
            className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            value={draft.tags.join(", ")}
            onChange={(e) =>
              setDraft({
                ...draft,
                tags: e.target.value
                  .split(",")
                  .map((t) => t.trim())
                  .filter(Boolean),
              })
            }
          />
        </label>
      </div>
      <div className="mt-3 flex gap-2">
        <button
          onClick={onSave}
          disabled={busy || !draft.question.trim() || !draft.answer.trim()}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          저장
        </button>
        <button
          onClick={onCancel}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100"
        >
          취소
        </button>
      </div>
    </div>
  );
}
