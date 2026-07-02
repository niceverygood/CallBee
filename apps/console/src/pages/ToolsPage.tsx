import { useState } from "react";
import { SYSTEM_TOOL_NAMES } from "@colli/contracts";
import type { CustomToolDefinition, JsonSchemaObject } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTools, useCreateTool, useUpdateTool, useDeleteTool } from "../api/hooks";
import type { CustomToolDraft } from "../api/types";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { Badge } from "../components/Badge";
import { PageHeader } from "../components/PageHeader";
import { btnPrimary, btnSecondary, btnSmall, btnSmallDanger } from "../components/ui";

const DEFAULT_SCHEMA: JsonSchemaObject = {
  type: "object",
  properties: {},
  additionalProperties: false,
};

const emptyDraft = (): CustomToolDraft => ({
  name: "",
  description: "",
  paramsSchema: DEFAULT_SCHEMA,
  webhookUrl: "",
  webhookSecret: "",
  timeoutMs: 8000,
  enabled: true,
});

const isSystemToolName = (name: string): boolean =>
  (SYSTEM_TOOL_NAMES as readonly string[]).includes(name);

/**
 * 에이전트 스튜디오 > 연동 — 우리 예약 시스템, 재고 조회처럼 외부 시스템 기능을
 * webhook 하나로 AI 상담원에게 연결한다(내부 계약은 커스텀 tool — 사용자 노출
 * 용어는 brand-guide §5 에 따라 "연동"). paramsSchema 는 v1 최소 기능으로
 * raw JSON textarea 하나만 제공한다.
 */
export function ToolsPage() {
  const tenantId = useTenantId();
  const { data, isLoading, error } = useTools(tenantId);
  const create = useCreateTool(tenantId);
  const update = useUpdateTool(tenantId);
  const remove = useDeleteTool(tenantId);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<CustomToolDraft>(emptyDraft());
  const [schemaText, setSchemaText] = useState(
    JSON.stringify(DEFAULT_SCHEMA, null, 2),
  );
  const [schemaError, setSchemaError] = useState<string | null>(null);

  const startNew = () => {
    setEditingId("__new__");
    setDraft(emptyDraft());
    setSchemaText(JSON.stringify(DEFAULT_SCHEMA, null, 2));
    setSchemaError(null);
  };
  const startEdit = (tool: CustomToolDefinition) => {
    setEditingId(String(tool.toolId));
    setDraft({
      name: tool.name,
      description: tool.description,
      paramsSchema: tool.paramsSchema,
      webhookUrl: tool.webhookUrl,
      webhookSecret: "",
      timeoutMs: tool.timeoutMs,
      enabled: tool.enabled,
    });
    setSchemaText(JSON.stringify(tool.paramsSchema, null, 2));
    setSchemaError(null);
  };
  const cancel = () => setEditingId(null);

  const onSchemaChange = (text: string) => {
    setSchemaText(text);
    try {
      const parsed = JSON.parse(text) as unknown;
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        (parsed as { type?: string }).type !== "object"
      ) {
        setSchemaError('JSON Schema 는 { "type": "object", ... } 형태여야 해요.');
        return;
      }
      setSchemaError(null);
      setDraft((d) => ({ ...d, paramsSchema: parsed as JsonSchemaObject }));
    } catch {
      setSchemaError("유효한 JSON 이 아니에요.");
    }
  };

  const save = () => {
    if (schemaError) return;
    if (editingId === "__new__") {
      create.mutate(draft, { onSuccess: () => setEditingId(null) });
    } else if (editingId) {
      update.mutate({ toolId: editingId, draft }, { onSuccess: () => setEditingId(null) });
    }
  };

  const nameConflict = isSystemToolName(draft.name.trim());

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="연동"
        subtitle="예약 확인, 재고 조회 같은 우리 시스템 기능을 webhook 으로 연결해요."
        actions={
          <button onClick={startNew} className={btnPrimary}>
            + 연동 추가
          </button>
        }
      />

      {editingId ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-5">
          <h2 className="mb-4 text-base font-semibold text-ink-800">
            {editingId === "__new__" ? "새 연동" : "연동 편집"}
          </h2>
          <div className="grid gap-4">
            <FormField
              label="이름"
              hint="영문 소문자·언더스코어. 기본 동작과 같은 이름은 쓸 수 없어요."
              error={
                nameConflict
                  ? "이 이름은 콜비 기본 동작과 겹쳐요. 다른 이름을 사용해 주세요."
                  : null
              }
            >
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: check_reservation"
              />
            </FormField>
            <FormField label="설명" hint="AI 가 언제 이 연동을 쓸지 판단하는 기준이 돼요.">
              <textarea
                rows={2}
                className={textareaCls}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </FormField>
            <FormField
              label="파라미터 스키마 (JSON)"
              hint='유효한 JSON Schema object 형태(예: {"type":"object","properties":{...},"additionalProperties":false})'
              error={schemaError}
            >
              <textarea
                rows={6}
                className={`${textareaCls} font-mono text-xs`}
                value={schemaText}
                onChange={(e) => onSchemaChange(e.target.value)}
              />
            </FormField>
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="Webhook 주소">
                <input
                  className={inputCls}
                  value={draft.webhookUrl}
                  onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })}
                  placeholder="https://example.com/webhooks/..."
                />
              </FormField>
              <FormField label="서명 시크릿" hint="선택. 요청 위조 방지용 HMAC 서명에 써요.">
                <input
                  className={inputCls}
                  type="password"
                  value={draft.webhookSecret}
                  onChange={(e) => setDraft({ ...draft, webhookSecret: e.target.value })}
                />
              </FormField>
              <FormField label="타임아웃(ms)">
                <input
                  type="number"
                  className={inputCls}
                  value={draft.timeoutMs}
                  onChange={(e) =>
                    setDraft({ ...draft, timeoutMs: Number(e.target.value) || 8000 })
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
                !!schemaError ||
                nameConflict ||
                !draft.name.trim() ||
                !draft.webhookUrl.trim()
              }
              className={btnPrimary}
            >
              저장
            </button>
          </div>
        </div>
      ) : null}

      {data && data.length === 0 && !editingId ? (
        <EmptyBlock label="아직 등록한 연동이 없어요. 우리 예약 시스템을 연결해 보세요." />
      ) : null}

      <div className="space-y-3">
        {(data ?? []).map((tool) => (
          <article
            key={String(tool.toolId)}
            className="rounded-xl border border-ink-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-mono text-sm font-semibold text-ink-900">
                  {tool.name}
                </h3>
                <p className="mt-1 text-sm text-ink-600">{tool.description}</p>
                <p className="mt-1 break-all text-xs text-ink-400">{tool.webhookUrl}</p>
                <div className="mt-2.5 flex flex-wrap gap-1.5">
                  <Badge
                    tone={
                      tool.enabled
                        ? "bg-success-50 text-success-700"
                        : "bg-ink-100 text-ink-600"
                    }
                  >
                    {tool.enabled ? "사용 중" : "꺼짐"}
                  </Badge>
                  <Badge>타임아웃 {tool.timeoutMs}ms</Badge>
                  {tool.hasWebhookSecret ? <Badge>서명 사용</Badge> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button onClick={() => startEdit(tool)} className={btnSmall}>
                  편집
                </button>
                <button
                  onClick={() => remove.mutate(String(tool.toolId))}
                  className={btnSmallDanger}
                >
                  삭제
                </button>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}
