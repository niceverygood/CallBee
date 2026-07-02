import { SYSTEM_TOOL_NAMES } from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTenant, useTools } from "../api/hooks";
import { useAgentConfigDraft } from "../lib/agent-config-draft";
import { parseLines, toLines } from "../lib/format";
import { FormField, inputCls, textareaCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 에이전트 스튜디오 > 응대 정책 — product-spec §4.2.
 * 사업장 소개 / 응대 톤 추가 지침 / 업종 특화 금지사항 / 폴백·재시도.
 * 업종 프리셋(industryKey)에 따라 placeholder 예시를 다르게 노출한다
 * (프리셋별 추천 문구는 콘솔 상수 — 서버 저장 아님).
 */

const CONSTRAINT_PLACEHOLDERS: Record<string, string> = {
  restaurant_cafe: "예: 예약 대리 취소를 확정하지 않습니다(사장님 확인 후 처리).",
  hospital_clinic: "예: 진단·처방 등 의료 조언을 하지 않습니다.",
  beauty: "예: 시술 결과를 보장하는 표현을 하지 않습니다.",
  academy: "예: 성적 향상을 보장하는 표현을 하지 않습니다.",
  ecommerce: "예: 환불 가능 여부를 임의로 확정하지 않습니다.",
  real_estate: "예: 시세·투자 판단을 단정적으로 말하지 않습니다.",
  lodging: "예: 현장 상황(객실 상태 등)을 임의로 확정하지 않습니다.",
  other: "예: 확인되지 않은 정보를 단정적으로 말하지 않습니다.",
};

const PERSONA_PLACEHOLDERS: Record<string, string> = {
  restaurant_cafe:
    "예: 20석 규모의 동네 파스타집이에요. 예약과 포장 주문 전화가 가장 많아요.",
  hospital_clinic: "예: 피부과 의원이에요. 진료 예약·변경 문의가 가장 많아요.",
  other: "예: 우리 사업장이 무엇을 하는 곳인지, 어떤 전화가 많은지 알려주세요.",
};

export function PolicyPage() {
  const tenantId = useTenantId();
  const { data: tenant } = useTenant(tenantId);
  const { data: tools } = useTools(tenantId);
  const { isLoading, error, draft, patch, save, saving, saveError, savedAt } =
    useAgentConfigDraft(tenantId);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const industryKey = (tenant?.industryKey as string | undefined) ?? "other";
  const constraintPlaceholder =
    CONSTRAINT_PLACEHOLDERS[industryKey] ?? CONSTRAINT_PLACEHOLDERS.other!;
  const personaPlaceholder =
    PERSONA_PLACEHOLDERS[industryKey] ?? PERSONA_PLACEHOLDERS.other!;

  const invalid =
    (draft.personaInstructions?.length ?? 0) > 1000 ||
    draft.toneExtra.length > 10 ||
    draft.toneExtra.some((t) => t.length > 100) ||
    draft.domainConstraints.length > 10 ||
    draft.domainConstraints.some((t) => t.length > 200) ||
    draft.maxIntentAttempts < 1 ||
    draft.maxIntentAttempts > 5;

  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="응대 정책"
        subtitle="AI 상담원이 무엇을 하고, 무엇을 절대 하지 않을지 정해요."
      />

      <Card className="space-y-4">
        <FormField
          label="사업장 소개"
          hint="AI 상담원이 우리 가게를 이해하는 기준이에요. 최대 1,000자."
        >
          <textarea
            rows={4}
            className={textareaCls}
            value={draft.personaInstructions ?? ""}
            maxLength={1000}
            onChange={(e) => patch({ personaInstructions: e.target.value || null })}
            placeholder={personaPlaceholder}
          />
        </FormField>

        <FormField
          label="응대 톤 추가 지침"
          hint="한 줄에 하나씩, 최대 10개(항목당 100자). 기본 응대 원칙(존댓말, 복창 확인)에 추가돼요."
        >
          <textarea
            rows={3}
            className={textareaCls}
            value={toLines(draft.toneExtra)}
            onChange={(e) => patch({ toneExtra: parseLines(e.target.value) })}
            placeholder="예: 단골손님처럼 친근하게, 다만 반말은 쓰지 않기"
          />
        </FormField>

        <FormField
          label="업종 특화 금지사항"
          hint="한 줄에 하나씩, 최대 10개(항목당 200자). AI 가 절대 하면 안 되는 말을 걸어두세요."
        >
          <textarea
            rows={3}
            className={textareaCls}
            value={toLines(draft.domainConstraints)}
            onChange={(e) => patch({ domainConstraints: parseLines(e.target.value) })}
            placeholder={constraintPlaceholder}
          />
        </FormField>

        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label="문의를 파악하지 못했을 때"
            hint="몇 번 물어봐도 문의를 파악하지 못하면 실행할 동작이에요."
          >
            <select
              className={inputCls}
              value={draft.intentUnresolvedFallbackTool}
              onChange={(e) => patch({ intentUnresolvedFallbackTool: e.target.value })}
            >
              <optgroup label="기본 동작">
                {SYSTEM_TOOL_NAMES.map((n) => (
                  <option key={n} value={n}>
                    {n === "request_callback" ? "콜백 접수 (권장)" : n}
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
          <FormField label="문의 파악 최대 시도" hint="1~5회.">
            <input
              type="number"
              min={1}
              max={5}
              className={inputCls}
              value={draft.maxIntentAttempts}
              onChange={(e) =>
                patch({ maxIntentAttempts: Math.max(1, Math.min(5, Number(e.target.value) || 1)) })
              }
            />
          </FormField>
        </div>

        <SaveBar
          onSave={() => save()}
          saving={saving}
          savedAt={savedAt}
          error={saveError}
          disabled={invalid}
        />
      </Card>
    </div>
  );
}
