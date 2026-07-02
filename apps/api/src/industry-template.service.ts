/**
 * 업종 템플릿 팩 적용 서비스 — POST /tenants/:id/industry-template 의 실로직.
 *
 * 적용 계획(무엇을 만들고 무엇을 건너뛰는지)은 @colli/contracts 의
 * planIndustryTemplateApply(순수 함수)가 전담한다 — 콘솔 데모(fixture) 모드와
 * 이 서비스가 같은 merge 의미론을 공유하기 위함. 이 서비스는 계획을 저장소에
 * 반영(upsert/create)하는 I/O 만 담당한다.
 *
 * 비파괴 보장: 기존 의도 key·KB 질문·채워진 설정 필드는 절대 덮어쓰지 않는다.
 * 매장별 값이 필요한 KB 는 enabled=false 로 생성된다(사장님이 답변을 채우고
 * 켜기 전에는 통화에서 미노출 — KnowledgeRepository.search 는 enabled=true 만 매칭).
 */
import {
  findIndustryTemplatePack,
  planIndustryTemplateApply,
  type ApplyIndustryTemplateResult,
  type TenantId,
} from "@colli/contracts";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
} from "./tenant.ports.js";
import type { KnowledgeRepository } from "./ports.js";
import { PrismaKnowledgeRepository } from "./adapters/prisma.js";
import { WebhookValidationError } from "./webhook-validation.js";

export interface IndustryTemplateServiceDeps {
  tenants: TenantRepository;
  agentConfigs: TenantAgentConfigRepository;
  intents: TenantIntentRepository;
  /**
   * 기본 KB 저장소(인메모리/테스트용). DATA_ADAPTER=prisma 일 때는 무시되고
   * 요청마다 테넌트 스코프 PrismaKnowledgeRepository 를 직접 만든다 —
   * KnowledgeItem 이 tenantId 필수 FK 라 단일 DI 인스턴스로는 여러 테넌트를
   * 스코프할 수 없다(tenants.controller.ts kbRepoFor 와 동일한 사유/패턴).
   */
  knowledge: KnowledgeRepository;
}

export class IndustryTemplateService {
  constructor(private readonly deps: IndustryTemplateServiceDeps) {}

  private kbRepoFor(tenantId: TenantId): KnowledgeRepository {
    if (process.env.DATA_ADAPTER === "prisma") {
      return new PrismaKnowledgeRepository(tenantId);
    }
    return this.deps.knowledge;
  }

  /**
   * @param requestedIndustryKey 명시한 팩 key. null 이면 테넌트의 가입
   *        업종(industryKey)을 따른다.
   */
  async apply(
    tenantId: TenantId,
    requestedIndustryKey: string | null,
  ): Promise<ApplyIndustryTemplateResult> {
    const kb = this.kbRepoFor(tenantId);
    const tenant = await this.deps.tenants.findById(tenantId);
    if (!tenant) {
      throw new WebhookValidationError("tenant_not_found", `no tenant: ${tenantId}`);
    }

    const industryKey = requestedIndustryKey?.trim() || tenant.industryKey || null;
    const pack = findIndustryTemplatePack(industryKey);
    if (!pack) {
      throw new WebhookValidationError(
        "template_not_found",
        `이 업종은 아직 템플릿 팩이 없어요: ${industryKey ?? "(업종 미지정)"}`,
      );
    }

    const [agentConfig, existingIntents, existingKb] = await Promise.all([
      this.deps.agentConfigs.get(tenantId),
      this.deps.intents.list(tenantId),
      kb.list(),
    ]);

    const plan = planIndustryTemplateApply(pack, {
      serviceName: agentConfig?.serviceName ?? tenant.name,
      agentConfig,
      existingIntents: existingIntents.map((i) => ({
        key: String(i.key),
        sortOrder: i.sortOrder,
      })),
      existingKbQuestions: existingKb.map((k) => k.question),
    });

    if (plan.agentConfigChanged) {
      await this.deps.agentConfigs.upsert(tenantId, plan.agentConfig);
    }

    for (const intent of plan.intentsToCreate) {
      await this.deps.intents.create(tenantId, {
        key: intent.key,
        label: intent.label,
        keywords: intent.keywords,
        routingToolName: intent.routingToolName,
        sortOrder: intent.sortOrder,
        enabled: intent.enabled,
      });
    }

    const createdKbQuestionsNeedingAnswer: string[] = [];
    const createdKbQuestionsEnabled: string[] = [];
    for (const item of plan.kbToCreate) {
      // category 는 테넌트 자유 의도 key(문자열) — KB 포트의 TicketCategory 는
      // v1 하위호환 타입이라 컨트롤러 KB 라우트와 동일하게 캐스팅해 넘긴다.
      await kb.create({
        category: item.category as never,
        question: item.question,
        answer: item.answer,
        keywords: item.keywords,
        enabled: item.enabled,
      });
      (item.enabled ? createdKbQuestionsEnabled : createdKbQuestionsNeedingAnswer).push(
        item.question,
      );
    }

    return {
      industryKey: pack.industryKey,
      packTitle: pack.title,
      agentConfigCreated: plan.agentConfigCreated,
      agentConfigUpdated: plan.agentConfigChanged && !plan.agentConfigCreated,
      createdIntentKeys: plan.intentsToCreate.map((i) => i.key),
      skippedIntentKeys: plan.skippedIntentKeys,
      createdKbQuestionsNeedingAnswer,
      createdKbQuestionsEnabled,
      skippedKbQuestions: plan.skippedKbQuestions,
    };
  }
}
