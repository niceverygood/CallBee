import { useEffect, useState } from "react";
import { useTenantId } from "../lib/tenant";
import { useAgentConfig, useUpdateAgentConfig } from "../api/hooks";
import type { TenantAgentConfigDraft } from "../api/types";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { Loading, ErrorBlock } from "../components/StateBlock";
import { parseLines, toLines } from "../lib/format";

const emptyDraft = (): TenantAgentConfigDraft => ({
  serviceName: "",
  agentName: "",
  greetingText: null,
  personaInstructions: null,
  toneExtra: [],
  domainConstraints: [],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
});

/**
 * (a) 에이전트 설정 탭 — serviceName/agentName/greetingText/personaInstructions/
 * toneExtra(문자열 배열)/domainConstraints(문자열 배열) 폼. 저장 시 PUT.
 */
export function AgentConfigPage() {
  const tenantId = useTenantId();
  const { data, isLoading, error } = useAgentConfig(tenantId);
  const update = useUpdateAgentConfig(tenantId);

  const [draft, setDraft] = useState<TenantAgentConfigDraft>(emptyDraft());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) {
      setDraft({
        serviceName: data.serviceName,
        agentName: data.agentName,
        greetingText: data.greetingText,
        personaInstructions: data.personaInstructions,
        toneExtra: [...data.toneExtra],
        domainConstraints: [...data.domainConstraints],
        intentUnresolvedFallbackTool: data.intentUnresolvedFallbackTool,
        maxIntentAttempts: data.maxIntentAttempts,
      });
    }
  }, [data]);

  const onSave = () => {
    update.mutate(draft, { onSuccess: () => setSavedAt(Date.now()) });
  };

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  return (
    <div className="max-w-2xl space-y-4 rounded-xl border border-slate-200 bg-white p-6">
      <div className="grid grid-cols-2 gap-4">
        <FormField label="서비스명(serviceName)">
          <input
            className={inputCls}
            value={draft.serviceName}
            onChange={(e) => setDraft({ ...draft, serviceName: e.target.value })}
          />
        </FormField>
        <FormField label="에이전트 이름(agentName)">
          <input
            className={inputCls}
            value={draft.agentName}
            onChange={(e) => setDraft({ ...draft, agentName: e.target.value })}
          />
        </FormField>
      </div>

      <FormField
        label="인사말(greetingText)"
        hint="비워두면 기본 템플릿(안녕하세요, {서비스명} 고객센터의 AI 상담원 {에이전트명}입니다)으로 합성됩니다."
      >
        <input
          className={inputCls}
          value={draft.greetingText ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, greetingText: e.target.value || null })
          }
          placeholder="비워두면 기본 템플릿 사용"
        />
      </FormField>

      <FormField
        label="역할 설명(personaInstructions)"
        hint='"# 역할" 섹션에 자유 서술로 추가됩니다.'
      >
        <textarea
          rows={3}
          className={textareaCls}
          value={draft.personaInstructions ?? ""}
          onChange={(e) =>
            setDraft({ ...draft, personaInstructions: e.target.value || null })
          }
        />
      </FormField>

      <FormField
        label="대화 톤 추가(toneExtra)"
        hint="한 줄에 하나씩 입력. 플랫폼 기본 톤 규칙에 추가로 append됩니다."
      >
        <textarea
          rows={3}
          className={textareaCls}
          value={toLines(draft.toneExtra)}
          onChange={(e) => setDraft({ ...draft, toneExtra: parseLines(e.target.value) })}
        />
      </FormField>

      <FormField
        label="업종 특화 절대 금지 사항(domainConstraints)"
        hint='한 줄에 하나씩 입력. "# 절대 금지 — 업종 특화" 섹션으로 렌더됩니다.'
      >
        <textarea
          rows={3}
          className={textareaCls}
          value={toLines(draft.domainConstraints)}
          onChange={(e) =>
            setDraft({ ...draft, domainConstraints: parseLines(e.target.value) })
          }
        />
      </FormField>

      <div className="grid grid-cols-2 gap-4">
        <FormField label="의도 미해결 폴백 tool">
          <input
            className={inputCls}
            value={draft.intentUnresolvedFallbackTool}
            onChange={(e) =>
              setDraft({ ...draft, intentUnresolvedFallbackTool: e.target.value })
            }
          />
        </FormField>
        <FormField label="의도 파악 최대 재시도 횟수">
          <input
            type="number"
            min={1}
            className={inputCls}
            value={draft.maxIntentAttempts}
            onChange={(e) =>
              setDraft({ ...draft, maxIntentAttempts: Number(e.target.value) || 1 })
            }
          />
        </FormField>
      </div>

      <div className="flex items-center gap-3 pt-2">
        <button
          onClick={onSave}
          disabled={update.isPending}
          className="rounded-lg bg-brand-600 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {update.isPending ? "저장 중…" : "저장"}
        </button>
        {savedAt ? (
          <span className="text-xs text-green-600">저장되었습니다.</span>
        ) : null}
        {update.isError ? (
          <span className="text-xs text-red-600">
            저장 실패:{" "}
            {update.error instanceof Error ? update.error.message : String(update.error)}
          </span>
        ) : null}
      </div>
    </div>
  );
}
