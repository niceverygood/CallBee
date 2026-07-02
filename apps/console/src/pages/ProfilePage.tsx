import { useTenantId } from "../lib/tenant";
import { useAgentConfigDraft } from "../lib/agent-config-draft";
import { FormField, inputCls } from "../components/FormField";
import { PageHeader } from "../components/PageHeader";
import { Card } from "../components/ui";
import { Badge } from "../components/Badge";
import { SaveBar } from "../components/SaveBar";
import { Loading, ErrorBlock } from "../components/StateBlock";

/**
 * 에이전트 스튜디오 > 프로필 — product-spec §4.1.
 * 상담원 이름 / 사업장 표시명 / 첫인사 멘트 / 마무리 멘트(신규) + 보이스 잠금
 * 카드(로드맵) + 실시간 통화 미리보기 패널(인사→고지→예시 문답→마무리).
 */
export function ProfilePage() {
  const tenantId = useTenantId();
  const { isLoading, error, draft, patch, save, saving, saveError, savedAt } =
    useAgentConfigDraft(tenantId);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const invalid =
    draft.agentName.trim().length < 1 ||
    draft.agentName.trim().length > 20 ||
    draft.serviceName.trim().length < 1 ||
    draft.serviceName.trim().length > 60 ||
    (draft.greetingText?.length ?? 0) > 200 ||
    (draft.closingText?.length ?? 0) > 200;

  const greetingPreview =
    draft.greetingText?.trim() ||
    `안녕하세요, ${draft.serviceName || "우리 가게"} 고객센터의 AI 상담원 ${
      draft.agentName || "상담원"
    }입니다.`;
  const closingPreview =
    draft.closingText?.trim() || "더 도와드릴 것이 없다면 통화를 마치겠습니다. 감사합니다.";

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="프로필"
        subtitle="AI 상담원의 이름과 인사말을 우리 가게 말투로 정해보세요."
      />

      <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
        <div className="space-y-6">
          <Card className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <FormField label="상담원 이름" hint="1~20자. 예: 콜리, 미소">
                <input
                  className={inputCls}
                  value={draft.agentName}
                  maxLength={20}
                  onChange={(e) => patch({ agentName: e.target.value })}
                />
              </FormField>
              <FormField label="사업장 표시명" hint="통화에서 안내할 우리 가게 이름이에요.">
                <input
                  className={inputCls}
                  value={draft.serviceName}
                  maxLength={60}
                  onChange={(e) => patch({ serviceName: e.target.value })}
                />
              </FormField>
            </div>

            <FormField
              label="첫인사 멘트"
              hint="비워두면 기본 인사말을 사용해요. 최대 200자."
            >
              <textarea
                rows={2}
                className={inputCls}
                value={draft.greetingText ?? ""}
                maxLength={200}
                onChange={(e) => patch({ greetingText: e.target.value || null })}
                placeholder={`안녕하세요, ${draft.serviceName || "{사업장 이름}"} 고객센터의 AI 상담원 ${draft.agentName || "{상담원 이름}"}입니다.`}
              />
            </FormField>

            <FormField
              label="마무리 멘트"
              hint="비워두면 기본 마무리 문구를 사용해요. 최대 200자."
            >
              <textarea
                rows={2}
                className={inputCls}
                value={draft.closingText ?? ""}
                maxLength={200}
                onChange={(e) => patch({ closingText: e.target.value || null })}
                placeholder="이용해 주셔서 감사합니다. 좋은 하루 보내세요."
              />
            </FormField>

            <SaveBar
              onSave={() => save()}
              saving={saving}
              savedAt={savedAt}
              error={saveError}
              disabled={invalid}
            />
          </Card>

          {/* 보이스 선택 — 로드맵 잠금 카드 */}
          <Card className="bg-ink-50/60">
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="flex items-center gap-2 text-base font-semibold text-ink-700">
                  보이스 선택
                  <Badge tone="bg-ink-100 text-ink-600">준비 중</Badge>
                </h2>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-500">
                  상담원 목소리를 고를 수 있는 기능을 준비하고 있어요. 지금은
                  기본 보이스로 응대해요.
                </p>
              </div>
              <span aria-hidden="true" className="text-xl text-ink-300">
                🔒
              </span>
            </div>
          </Card>
        </div>

        {/* 통화 미리보기 패널 */}
        <Card className="lg:sticky lg:top-8">
          <h2 className="text-base font-semibold text-ink-900">통화 미리보기</h2>
          <p className="mt-1 text-[13px] text-ink-500">
            저장 전에 실제 통화 흐름으로 확인해 보세요.
          </p>
          <div className="mt-4 space-y-2.5">
            <PreviewBubble who="agent">{greetingPreview}</PreviewBubble>
            <p className="text-center text-[11px] text-ink-400">
              서비스 품질을 위해 통화가 녹음됨을 안내
            </p>
            <PreviewBubble who="caller">영업시간이 어떻게 되나요?</PreviewBubble>
            <PreviewBubble who="agent">
              네, 영업시간을 안내해 드릴게요. 더 궁금하신 점이 있으실까요?
            </PreviewBubble>
            <PreviewBubble who="agent">{closingPreview}</PreviewBubble>
          </div>
        </Card>
      </div>
    </div>
  );
}

function PreviewBubble({ who, children }: { who: "agent" | "caller"; children: string }) {
  return (
    <div className={`flex ${who === "caller" ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[90%] rounded-xl px-3 py-2 text-[13px] leading-relaxed ${
          who === "caller"
            ? "rounded-tr-sm bg-brand-400 text-ink-900"
            : "rounded-tl-sm bg-ink-100 text-ink-800"
        }`}
      >
        {children}
      </div>
    </div>
  );
}
