import { useMemo, useState } from "react";
import { useTenantId } from "../lib/tenant";
import { useKb, useCreateKb, useUpdateKb, useDeleteKb, useIntents } from "../api/hooks";
import type { KnowledgeItem, KnowledgeItemDraft } from "../api/types";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { btnPrimary, btnSecondary, btnSmall, btnSmallDanger } from "../components/ui";
import { formatDateTime, parseCsv, toCsv } from "../lib/format";

const emptyDraft = (): KnowledgeItemDraft => ({
  category: "",
  question: "",
  answer: "",
  tags: [],
  enabled: true,
});

/**
 * 에이전트 스튜디오 > 자주 묻는 질문 — 질문/답변을 등록해두면 AI 상담원이
 * 그대로 답변한다(내부 계약은 KB/KnowledgeItem — 사용자 노출 용어는
 * brand-guide §5 에 따라 "자주 묻는 질문"). 분류는 문의 유형에서 고른다.
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
    setDraft({
      category: k.category,
      question: k.question,
      answer: k.answer,
      tags: [...k.tags],
      enabled: k.enabled,
    });
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
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="자주 묻는 질문"
        subtitle="질문과 답변을 등록해두면 AI 상담원이 그대로 답변해요."
        actions={
          <button onClick={startNew} className={btnPrimary}>
            + 질문 추가
          </button>
        }
      />

      <div className="mb-4">
        <label className="text-[13px] font-semibold text-ink-700">
          분류 필터
          <select
            className="ml-2 rounded-lg border border-ink-200 bg-white px-2.5 py-1.5 text-sm font-normal text-ink-700"
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
      </div>

      {editingId ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink-800">
            {editingId === "__new__" ? "새 질문" : "질문 편집"}
          </h2>
          <div className="grid gap-4">
            <FormField label="분류" hint="문의 유형에서 골라요.">
              <select
                className={inputCls}
                value={draft.category}
                onChange={(e) => setDraft({ ...draft, category: e.target.value })}
              >
                <option value="">선택해 주세요</option>
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
                placeholder="예: 주차할 수 있나요?"
              />
            </FormField>
            <FormField label="답변" hint="AI 상담원이 이 문장을 바탕으로 답변해요.">
              <textarea
                rows={3}
                className={textareaCls}
                value={draft.answer}
                onChange={(e) => setDraft({ ...draft, answer: e.target.value })}
              />
            </FormField>
            <FormField label="태그" hint="쉼표로 구분해 입력해요.">
              <input
                className={inputCls}
                value={toCsv(draft.tags)}
                onChange={(e) => setDraft({ ...draft, tags: parseCsv(e.target.value) })}
              />
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
                !draft.question.trim() ||
                !draft.answer.trim()
              }
              className={btnPrimary}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {data && grouped.size === 0 && !editingId ? (
        <EmptyBlock label="아직 등록한 질문이 없어요. 전화로 자주 받는 질문부터 채워보세요.">
          <button onClick={startNew} className={btnSecondary}>
            첫 질문 만들기
          </button>
        </EmptyBlock>
      ) : null}

      <div className="space-y-6">
        {[...grouped.entries()].map(([cat, items]) => (
          <section key={cat}>
            <h2 className="mb-2 text-base font-semibold text-ink-700">
              {labelFor(cat)} <span className="font-normal text-ink-400">({items.length})</span>
            </h2>
            <div className="space-y-3">
              {items.map((k) => (
                <article
                  key={String(k.id)}
                  className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-sm font-semibold text-ink-900">
                        {k.question}
                        {!k.enabled ? (
                          <Badge tone="ml-2 bg-ink-100 text-ink-500">
                            꺼짐 — 답변 확인 후 켜 주세요
                          </Badge>
                        ) : null}
                      </h3>
                      <p className="mt-1 text-sm leading-relaxed text-ink-600">{k.answer}</p>
                      {k.tags.length > 0 ? (
                        <div className="mt-2.5 flex flex-wrap gap-1.5">
                          {k.tags.map((t) => (
                            <Badge key={t} tone="bg-brand-100 text-brand-800">
                              #{t}
                            </Badge>
                          ))}
                        </div>
                      ) : null}
                      <div className="mt-2 text-xs text-ink-400">
                        수정: {formatDateTime(k.updatedAt)}
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      <button
                        onClick={() =>
                          update.mutate({ id: String(k.id), patch: { enabled: !k.enabled } })
                        }
                        className={btnSmall}
                        title={
                          k.enabled
                            ? "끄면 통화에서 이 답변을 쓰지 않아요"
                            : "켜면 통화에서 이 답변을 사용해요"
                        }
                      >
                        {k.enabled ? "끄기" : "켜기"}
                      </button>
                      <button onClick={() => startEdit(k)} className={btnSmall}>
                        편집
                      </button>
                      <button
                        onClick={() => remove.mutate(String(k.id))}
                        className={btnSmallDanger}
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
