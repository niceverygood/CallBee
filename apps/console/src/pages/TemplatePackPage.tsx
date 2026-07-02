import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  INDUSTRY_TEMPLATE_PACKS,
  findIndustryTemplatePack,
  type ApplyIndustryTemplateResult,
  type IndustryTemplatePack,
} from "@colli/contracts";
import { useTenantId } from "../lib/tenant";
import { useTenant, useApplyIndustryTemplate } from "../api/hooks";
import { Badge } from "../components/Badge";
import { Loading, ErrorBlock } from "../components/StateBlock";
import { PageHeader } from "../components/PageHeader";
import { Card, CardHeader, btnPrimary, btnSecondary } from "../components/ui";

/** 팩 의도가 어느 시스템 동작으로 이어지는지 사용자 언어로 설명(내부 tool 이름 비노출). */
const ROUTING_LABELS: Record<string, string> = {
  create_ticket: "접수하고 확인 후 연락",
  get_kb_answer: "자주 묻는 질문으로 바로 답변",
  escalate_to_human: "담당자에게 바로 연결",
  request_callback: "콜백 예약",
};

function routingLabel(toolName: string | null): string {
  if (!toolName) return "기본 응대";
  return ROUTING_LABELS[toolName] ?? "맞춤 동작";
}

/**
 * 에이전트 스튜디오 > 업종 팩 — 업종별 시작 설정 묶음(문의 유형·응대 수칙·
 * 자주 묻는 질문·문자 문구)을 한 번에 적용한다. 적용은 항상 비파괴 merge:
 * 이미 만든 항목은 절대 덮어쓰지 않는다(서버와 데모가 같은 계획 로직 공유 —
 * @colli/contracts planIndustryTemplateApply).
 */
export function TemplatePackPage() {
  const tenantId = useTenantId();
  const { data: tenant, isLoading, error } = useTenant(tenantId);
  const apply = useApplyIndustryTemplate(tenantId);

  const myPack = useMemo(
    () => findIndustryTemplatePack(tenant?.industryKey ?? null),
    [tenant?.industryKey],
  );
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // 내 업종 팩이 있으면 최초 진입 시 그 팩을 기본 선택한다.
  useEffect(() => {
    if (selectedKey === null && myPack) setSelectedKey(myPack.industryKey);
  }, [selectedKey, myPack]);

  const selected: IndustryTemplatePack | undefined =
    findIndustryTemplatePack(selectedKey) ?? INDUSTRY_TEMPLATE_PACKS[0];
  const [result, setResult] = useState<ApplyIndustryTemplateResult | null>(null);

  if (isLoading) return <Loading />;
  if (error) return <ErrorBlock error={error} />;

  const onApply = () => {
    if (!selected) return;
    setResult(null);
    apply.mutate(selected.industryKey, { onSuccess: (r) => setResult(r) });
  };

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        title="업종 팩"
        subtitle="업종에 맞는 문의 유형·응대 수칙·자주 묻는 질문을 한 번에 채워요. 이미 만든 항목은 절대 덮어쓰지 않아요."
      />

      {/* 팩 선택 */}
      <div className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {INDUSTRY_TEMPLATE_PACKS.map((pack) => {
          const isMine = myPack?.industryKey === pack.industryKey;
          const isSelected = selected?.industryKey === pack.industryKey;
          return (
            <button
              key={pack.industryKey}
              onClick={() => {
                setSelectedKey(pack.industryKey);
                setResult(null);
              }}
              className={`rounded-xl border p-4 text-left transition ${
                isSelected
                  ? "border-brand-400 bg-brand-50/60 shadow-sm"
                  : "border-ink-200 bg-white hover:border-brand-300"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-semibold text-ink-900">{pack.title}</span>
                {isMine ? <Badge tone="bg-brand-100 text-brand-800">내 업종</Badge> : null}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-ink-500">{pack.tagline}</p>
            </button>
          );
        })}
      </div>

      {selected ? (
        <Card>
          <CardHeader
            title={selected.title}
            description={`문의 유형 ${selected.intents.length}개 · 응대 수칙 ${selected.domainConstraints.length}개 · 자주 묻는 질문 ${selected.kbItems.length}개`}
            actions={
              <button onClick={onApply} disabled={apply.isPending} className={btnPrimary}>
                {apply.isPending ? "적용하는 중…" : "이 팩 적용하기"}
              </button>
            }
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-800">문의 유형</h3>
              <ul className="space-y-2">
                {selected.intents.map((intent) => (
                  <li
                    key={intent.key}
                    className="flex items-center justify-between gap-3 rounded-lg border border-ink-100 bg-ink-50/50 px-3 py-2"
                  >
                    <span className="text-sm font-medium text-ink-800">{intent.label}</span>
                    <span className="text-xs text-ink-500">
                      {routingLabel(intent.routingToolName)}
                    </span>
                  </li>
                ))}
              </ul>

              {selected.emergencyKeywords.length > 0 ? (
                <>
                  <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-800">긴급 키워드</h3>
                  <p className="mb-2 text-xs text-ink-500">
                    이 단어가 들리면 즉시 담당자 연결을 최우선으로 안내해요.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {selected.emergencyKeywords.map((kw) => (
                      <Badge key={kw} tone="bg-danger-50 text-danger-700">
                        {kw}
                      </Badge>
                    ))}
                  </div>
                </>
              ) : null}

              <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-800">응대 수칙</h3>
              <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-ink-600">
                {selected.domainConstraints.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </section>

            <section>
              <h3 className="mb-2 text-sm font-semibold text-ink-800">자주 묻는 질문</h3>
              <ul className="space-y-2">
                {selected.kbItems.map((item) => (
                  <li
                    key={item.question}
                    className="rounded-lg border border-ink-100 bg-white px-3 py-2"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-sm font-medium text-ink-800">{item.question}</span>
                      {item.enabledOnApply ? (
                        <Badge tone="bg-success-50 text-success-700">바로 사용</Badge>
                      ) : (
                        <Badge tone="bg-warn-50 text-warn-700">답변 입력 필요</Badge>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs leading-relaxed text-ink-500">
                "답변 입력 필요" 질문은 꺼진 상태로 만들어져요. 자주 묻는 질문에서 우리 매장
                내용으로 채우고 켜기 전에는 통화에서 쓰이지 않아요.
              </p>

              <h3 className="mb-2 mt-5 text-sm font-semibold text-ink-800">함께 채워지는 것</h3>
              <ul className="list-inside list-disc space-y-1 text-sm leading-relaxed text-ink-600">
                <li>AI 상담원 역할 설명(프로필이 비어 있을 때만)</li>
                <li>대화 톤 지침 {selected.toneExtra.length}개</li>
                <li>문자 안내 문구 프리필(발송은 꺼진 상태 — 문자 안내에서 직접 켜요)</li>
              </ul>
            </section>
          </div>
        </Card>
      ) : null}

      {apply.error ? (
        <div className="mt-4">
          <ErrorBlock error={apply.error} />
        </div>
      ) : null}

      {result ? (
        <div className="mt-5 rounded-xl border border-success-200 bg-success-50/50 p-5">
          <h2 className="text-base font-semibold text-ink-900">
            {result.packTitle} 적용 완료 🎉
          </h2>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-ink-700">
            <li>
              문의 유형 <b>{result.createdIntentKeys.length}개</b> 추가
              {result.skippedIntentKeys.length > 0
                ? ` (이미 있어서 건너뜀 ${result.skippedIntentKeys.length}개)`
                : ""}
            </li>
            <li>
              자주 묻는 질문{" "}
              <b>
                {result.createdKbQuestionsEnabled.length +
                  result.createdKbQuestionsNeedingAnswer.length}
                개
              </b>{" "}
              추가
              {result.skippedKbQuestions.length > 0
                ? ` (건너뜀 ${result.skippedKbQuestions.length}개)`
                : ""}
            </li>
            {result.createdKbQuestionsNeedingAnswer.length > 0 ? (
              <li>
                이 중 <b>{result.createdKbQuestionsNeedingAnswer.length}개</b>는 답변을 채워야
                켤 수 있어요:{" "}
                {result.createdKbQuestionsNeedingAnswer.map((q) => `"${q}"`).join(", ")}
              </li>
            ) : null}
            <li>
              AI 상담원 설정{" "}
              {result.agentConfigCreated
                ? "새로 만들었어요"
                : result.agentConfigUpdated
                  ? "빈 항목을 채웠어요"
                  : "변경 없음(이미 설정돼 있어요)"}
            </li>
          </ul>
          <div className="mt-4 flex flex-wrap gap-2">
            <Link to={`/tenants/${tenantId}/studio/kb`} className={btnPrimary}>
              자주 묻는 질문 답변 채우러 가기
            </Link>
            <Link to={`/tenants/${tenantId}/studio/intents`} className={btnSecondary}>
              문의 유형 확인
            </Link>
            <Link to={`/tenants/${tenantId}/studio/profile`} className={btnSecondary}>
              프로필 확인
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
}
