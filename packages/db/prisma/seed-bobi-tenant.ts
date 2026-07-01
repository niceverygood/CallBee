/**
 * BoBi → 테넌트 #1 시드 스크립트.
 *
 * docs/tenant-platform-architecture.md §4 의 값을 정확히 이식한다:
 * - Tenant(slug="bobi", phoneNumber="07052361037", ...)
 * - TenantAgentConfig(1행)
 * - TenantIntent(7행) — @colli/dialogue 의 BOBI_DEFAULT_TENANT_INTENTS 를
 *   그대로 재사용한다(INTENTS/INTENT_LABELS/KEYWORD_MAP 이식 결과, dialogue
 *   워커가 이미 export 하도록 확장해두었다).
 * - TenantTool 은 0행(BoBi 의 8개 시스템 tool 은 webhook 이 아니라 apps/api 의
 *   ToolsService 네이티브 구현이므로 TenantTool 테이블에 넣지 않는다 — §4.4).
 *
 * 실행 전제(§1.4/§6 순서, 이 워커 책임):
 *   1) prisma migrate dev 로 신규 4테이블 생성
 *   2) 기존 7테이블에 tenantId nullable 추가
 *   3) 이 스크립트로 BoBi 테넌트 백필 데이터 생성
 *   4) 기존 7테이블의 tenantId 를 이 스크립트가 만든 Tenant.id 로 UPDATE
 *   5) tenantId NOT NULL 전환
 *   6) CallSession.intent/Ticket.category/KnowledgeItem.category enum→text 전환
 *
 * 주의: 이 파일은 라이브 DB 접속 없이 타입체크만 되도록 작성되었다. 실제 실행은
 * `pnpm --filter @colli/db exec tsx prisma/seed-bobi-tenant.ts` 로 하되, 라이브
 * Supabase 접속이 해결된 뒤 Orchestrator/운영자가 명시적으로 실행한다(이번
 * 세션에서는 실행하지 않음 — 지시사항).
 */
import { prisma } from "../src/index.js";
import { BOBI_DEFAULT_TENANT_INTENTS } from "@colli/dialogue";

const BOBI_TENANT_SEED = {
  slug: "bobi",
  name: "BoBi",
  industryLabel: "보험설계사 SaaS",
  // prototypes/clawops-quickstart .env 의 CLAWOPS_070_NUMBER 와 동일.
  phoneNumber: "07052361037",
  status: "active" as const,
  plan: "enterprise" as const,
  ownerEmail: null,
};

const BOBI_AGENT_CONFIG_SEED = {
  serviceName: "BoBi",
  agentName: "보비",
  greetingText: null,
  personaInstructions:
    "BoBi는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다. 전화로 걸려온 " +
    "BoBi 유료 구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다. " +
    "응대 범위는 BoBi(소프트웨어) 사용 지원에 한정됩니다.",
  toneExtra: [] as string[],
  domainConstraints: [
    "보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의 역할은 " +
      "BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련 질문이 오면 " +
      "escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.",
  ],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};

export async function seedBobiTenant(): Promise<{ tenantId: string }> {
  const tenant = await prisma.tenant.upsert({
    where: { slug: BOBI_TENANT_SEED.slug },
    update: BOBI_TENANT_SEED,
    create: BOBI_TENANT_SEED,
  });

  await prisma.tenantAgentConfig.upsert({
    where: { tenantId: tenant.id },
    update: BOBI_AGENT_CONFIG_SEED,
    create: { tenantId: tenant.id, ...BOBI_AGENT_CONFIG_SEED },
  });

  // BOBI_DEFAULT_TENANT_INTENTS(7종) — @colli/dialogue 의 INTENTS/INTENT_LABELS/
  // KEYWORD_MAP 이식 결과를 그대로 사용(§4.3).
  for (const intent of BOBI_DEFAULT_TENANT_INTENTS) {
    await prisma.tenantIntent.upsert({
      where: { tenantId_key: { tenantId: tenant.id, key: intent.key } },
      update: {
        label: intent.label,
        keywords: intent.keywords,
        routingToolName: intent.routingToolName,
        sortOrder: intent.sortOrder,
        enabled: intent.enabled,
      },
      create: {
        tenantId: tenant.id,
        key: intent.key,
        label: intent.label,
        keywords: intent.keywords,
        routingToolName: intent.routingToolName,
        sortOrder: intent.sortOrder,
        enabled: intent.enabled,
      },
    });
  }

  // TenantTool: BoBi 는 0행(§4.4) — 8개 시스템 tool 은 ToolsService 네이티브 구현.

  return { tenantId: tenant.id };
}

/**
 * 기존 7테이블(CallSession/Ticket/KnowledgeItem/Notification/ConsentRecord/
 * CallbackRequest/ToolInvocation)의 tenantId 를 BoBi 테넌트 id 로 백필한다.
 * tenantId 컬럼이 nullable 인 마이그레이션 단계에서만 호출한다(§1.4 순서 2).
 */
export async function backfillExistingTablesToBobiTenant(
  tenantId: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.callSession.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.ticket.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.knowledgeItem.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.notification.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.consentRecord.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.callbackRequest.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
    prisma.toolInvocation.updateMany({
      where: { tenantId: null as unknown as string },
      data: { tenantId },
    }),
  ]);
}

const isEntry =
  typeof process !== "undefined" &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1]}`;

if (isEntry) {
  seedBobiTenant()
    .then(async ({ tenantId }) => {
      // 이번 배포는 tenantId 가 처음부터 NOT NULL 인 단일 init 마이그레이션이라
      // 백필할 기존 row 가 없다(신규 DB). backfillExistingTablesToBobiTenant 는
      // "nullable → 백필 → NOT NULL" 점진적 마이그레이션 경로용으로 남겨두되
      // 여기서는 호출하지 않는다.
      // eslint-disable-next-line no-console
      console.log(`[seed-bobi-tenant] done. tenantId=${tenantId}`);
      await prisma.$disconnect();
    })
    .catch(async (err) => {
      // eslint-disable-next-line no-console
      console.error("[seed-bobi-tenant] failed", err);
      await prisma.$disconnect();
      process.exit(1);
    });
}
