import { useState } from "react";
import { SYSTEM_TOOL_NAMES } from "@colli/contracts";
import type { CustomToolDefinition, JsonSchemaObject } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTools, useCreateTool, useUpdateTool, useDeleteTool } from "../api/hooks";
import type { CustomToolDraft } from "../api/types";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { Loading, ErrorBlock, EmptyBlock } from "../components/StateBlock";
import { Badge } from "../components/Badge";

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
 * (c) 커스텀 Tool 탭 — TenantTool CRUD 폼(name/description/webhookUrl/
 * webhookSecret/timeoutMs/enabled). paramsSchema 는 v1 최소 기능으로 raw JSON
 * textarea 하나만 제공한다(유효한 JSON Schema object 형태로 apps/api 전송).
 * name 이 SYSTEM_TOOL_NAMES 와 겹치면 프론트에서 즉시 경고 표시(UX 방어,
 * 서버 검증은 apps/api 몫).
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
        setSchemaError('JSON Schema 는 { "type": "object", ... } 형태여야 합니다.');
        return;
      }
      setSchemaError(null);
      setDraft((d) => ({ ...d, paramsSchema: parsed as JsonSchemaObject }));
    } catch {
      setSchemaError("유효한 JSON 이 아닙니다.");
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
    <div>
      <div className="mb-4 flex justify-end">
        <button
          onClick={startNew}
          className="rounded-lg bg-brand-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-brand-700"
        >
          + Tool 추가
        </button>
      </div>

      {editingId ? (
        <div className="mb-4 rounded-xl border border-brand-200 bg-brand-50/40 p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">
            {editingId === "__new__" ? "새 커스텀 Tool" : "Tool 편집"}
          </h2>
          <div className="grid gap-3">
            <FormField label="name" hint="LLM function name. SYSTEM_TOOL_NAMES 와 충돌 불가.">
              <input
                className={inputCls}
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="예: check_reservation"
              />
              {nameConflict ? (
                <p className="mt-1 text-xs font-medium text-red-600">
                  이 이름은 플랫폼 시스템 tool({SYSTEM_TOOL_NAMES.join(", ")})과 겹칩니다.
                  다른 이름을 사용하세요.
                </p>
              ) : null}
            </FormField>
            <FormField label="description">
              <textarea
                rows={2}
                className={textareaCls}
                value={draft.description}
                onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              />
            </FormField>
            <FormField
              label="paramsSchema (raw JSON)"
              hint='유효한 JSON Schema object 형태(예: {"type":"object","properties":{...},"additionalProperties":false})'
            >
              <textarea
                rows={6}
                className={`${textareaCls} font-mono text-xs`}
                value={schemaText}
                onChange={(e) => onSchemaChange(e.target.value)}
              />
              {schemaError ? (
                <p className="mt-1 text-xs font-medium text-red-600">{schemaError}</p>
              ) : null}
            </FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="webhookUrl">
                <input
                  className={inputCls}
                  value={draft.webhookUrl}
                  onChange={(e) => setDraft({ ...draft, webhookUrl: e.target.value })}
                  placeholder="https://example.com/webhooks/..."
                />
              </FormField>
              <FormField label="webhookSecret" hint="선택. HMAC 서명용">
                <input
                  className={inputCls}
                  type="password"
                  value={draft.webhookSecret}
                  onChange={(e) => setDraft({ ...draft, webhookSecret: e.target.value })}
                />
              </FormField>
              <FormField label="timeoutMs">
                <input
                  type="number"
                  className={inputCls}
                  value={draft.timeoutMs}
                  onChange={(e) =>
                    setDraft({ ...draft, timeoutMs: Number(e.target.value) || 8000 })
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
          </div>
          <div className="mt-3 flex gap-2">
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
        <EmptyBlock label="등록된 커스텀 tool 이 없습니다." />
      ) : null}

      <div className="space-y-2">
        {(data ?? []).map((tool) => (
          <article
            key={String(tool.toolId)}
            className="rounded-xl border border-slate-200 bg-white p-4"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <h3 className="font-mono text-sm font-semibold text-slate-800">
                  {tool.name}
                </h3>
                <p className="mt-1 text-sm text-slate-600">{tool.description}</p>
                <p className="mt-1 text-xs text-slate-400">{tool.webhookUrl}</p>
                <div className="mt-2 flex flex-wrap gap-1">
                  <Badge tone={tool.enabled ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-500"}>
                    {tool.enabled ? "활성" : "비활성"}
                  </Badge>
                  <Badge>timeout {tool.timeoutMs}ms</Badge>
                  {tool.hasWebhookSecret ? <Badge>secret 설정됨</Badge> : null}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <button
                  onClick={() => startEdit(tool)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100"
                >
                  편집
                </button>
                <button
                  onClick={() => remove.mutate(String(tool.toolId))}
                  className="rounded border border-red-200 px-2 py-1 text-xs text-red-600 hover:bg-red-50"
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
