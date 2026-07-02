/**
 * TenantModule — 테넌트 CRUD + 커스텀tool 실행기 + 070 라우팅 조회를 조립하는
 * 얇은 NestJS 모듈(ToolsModule 과 동일 패턴).
 *
 * 기본 바인딩은 인메모리 어댑터(데모/로컬). `DATA_ADAPTER=prisma` 환경변수가
 * 설정되면 실제 Postgres(@colli/db, Prisma) 어댑터로 스왑한다(main.ts 가
 * dotenv 로 .env 를 로드한 뒤 이 모듈이 부트스트랩되므로 process.env 로 판별
 * 가능). WEBHOOK_TOOL_INVOKER 는 실HTTP 구현이 아직 없어 두 모드 모두
 * 인메모리를 유지한다(범위 밖).
 *
 * 주의: 기존 유닛테스트(tenant-harness.ts 등)는 NestJS DI 를 전혀 거치지 않고
 * InMemory* 클래스를 직접 new 해서 서비스를 조립하므로, 이 모듈의 provider
 * 배열 변경은 테스트 결과에 영향을 주지 않는다.
 */
import { Module, type Provider } from "@nestjs/common";
import { TenantsController } from "./tenants.controller.js";
import { OnboardingController } from "./onboarding.controller.js";
import { TenantResolverService } from "./tenant-resolver.service.js";
import {
  CustomToolExecutor,
  type CustomToolExecutorDeps,
} from "./custom-tool-executor.service.js";
import {
  TENANT_REPO,
  TENANT_AGENT_CONFIG_REPO,
  TENANT_INTENT_REPO,
  CUSTOM_TOOL_REPO,
  WEBHOOK_TOOL_INVOKER,
  TRACE_PORT,
  KNOWLEDGE_REPO,
  CALL_SESSION_READ_REPO,
} from "./tokens.js";
import {
  InMemoryTenantRepository,
  InMemoryTenantAgentConfigRepository,
  InMemoryTenantIntentRepository,
  InMemoryCustomToolRepository,
  InMemoryWebhookToolInvoker,
  InMemoryCallSessionReadRepository,
} from "./adapters/tenant-in-memory.js";
import {
  PrismaTenantRepository,
  PrismaTenantAgentConfigRepository,
  PrismaTenantIntentRepository,
  PrismaCustomToolRepository,
  PrismaCallSessionReadRepository,
} from "./adapters/tenant-prisma.js";
import { InMemoryTrace, InMemoryKnowledgeRepository } from "./adapters/in-memory.js";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
  WebhookToolInvoker,
} from "./tenant.ports.js";
import type { TracePort } from "./ports.js";

// 인메모리(기본) 포트 프로바이더.
const inMemoryPortProviders: Provider[] = [
  { provide: TENANT_REPO, useClass: InMemoryTenantRepository },
  { provide: TENANT_AGENT_CONFIG_REPO, useClass: InMemoryTenantAgentConfigRepository },
  { provide: TENANT_INTENT_REPO, useClass: InMemoryTenantIntentRepository },
  { provide: CUSTOM_TOOL_REPO, useClass: InMemoryCustomToolRepository },
  { provide: CALL_SESSION_READ_REPO, useClass: InMemoryCallSessionReadRepository },
  { provide: WEBHOOK_TOOL_INVOKER, useClass: InMemoryWebhookToolInvoker },
  // ToolsModule 이 이미 TRACE_PORT/KNOWLEDGE_REPO 를 바인딩하지만, TenantModule 을
  // 단독으로도 부트스트랩할 수 있도록 기본값을 여기서도 제공한다(NestJS 는
  // 마지막 바인딩이 우선). TenantsController 가 KB 라우트에서 KNOWLEDGE_REPO 를
  // 직접 주입받으므로 이 모듈에도 바인딩이 필요하다.
  { provide: TRACE_PORT, useClass: InMemoryTrace },
  { provide: KNOWLEDGE_REPO, useClass: InMemoryKnowledgeRepository },
];

// Prisma(라이브 Postgres) 포트 프로바이더. DATA_ADAPTER=prisma 일 때만 사용.
// PrismaTenantRepository 등은 테넌트 전역 테이블(Tenant/TenantIntent/TenantTool)을
// 다루므로 tenantId 생성자 인자가 필요 없다(adapters/tenant-prisma.ts 참조).
//
// KNOWLEDGE_REPO 는 예외: PrismaKnowledgeRepository 는 tenantId 를 생성자에서
// 받는 "테넌트 스코프 인스턴스"라 이 모듈 레벨의 단일 DI 바인딩으로는 여러
// 테넌트를 올바르게 스코프할 수 없다(adapters/prisma.ts 상단 주석 참조 — 이
// 배선은 "통합 단계 결정" 사항으로 명시돼 있음). 따라서 TenantsController 의
// KB 라우트는 DATA_ADAPTER=prisma 일 때 이 DI 바인딩을 쓰지 않고 경로의 :id
// 로 직접 PrismaKnowledgeRepository 를 생성한다(tenants.controller.ts 참조).
// 이 바인딩은 다른 소비자(예: ToolsService, 단일 프로세스=단일 테넌트 가정)를
// 위한 하위호환용 기본값으로만 남긴다.
const prismaPortProviders: Provider[] = [
  { provide: TENANT_REPO, useClass: PrismaTenantRepository },
  { provide: TENANT_AGENT_CONFIG_REPO, useClass: PrismaTenantAgentConfigRepository },
  { provide: TENANT_INTENT_REPO, useClass: PrismaTenantIntentRepository },
  { provide: CUSTOM_TOOL_REPO, useClass: PrismaCustomToolRepository },
  { provide: CALL_SESSION_READ_REPO, useClass: PrismaCallSessionReadRepository },
  // 실HTTP webhook invoker 는 이번 범위 밖 — 인메모리 목을 그대로 사용.
  { provide: WEBHOOK_TOOL_INVOKER, useClass: InMemoryWebhookToolInvoker },
  { provide: TRACE_PORT, useClass: InMemoryTrace },
  { provide: KNOWLEDGE_REPO, useClass: InMemoryKnowledgeRepository },
];

const defaultPortProviders: Provider[] =
  process.env.DATA_ADAPTER === "prisma" ? prismaPortProviders : inMemoryPortProviders;

const resolverProvider: Provider = {
  provide: TenantResolverService,
  useFactory: (
    tenants: TenantRepository,
    agentConfigs: TenantAgentConfigRepository,
    intents: TenantIntentRepository,
    customTools: CustomToolRepository,
  ): TenantResolverService =>
    new TenantResolverService({ tenants, agentConfigs, intents, customTools }),
  inject: [TENANT_REPO, TENANT_AGENT_CONFIG_REPO, TENANT_INTENT_REPO, CUSTOM_TOOL_REPO],
};

const customToolExecutorProvider: Provider = {
  provide: CustomToolExecutor,
  useFactory: (
    customTools: CustomToolRepository,
    webhookInvoker: WebhookToolInvoker,
    trace: TracePort,
  ): CustomToolExecutor => {
    const deps: CustomToolExecutorDeps = { customTools, webhookInvoker, trace };
    return new CustomToolExecutor(deps);
  },
  inject: [CUSTOM_TOOL_REPO, WEBHOOK_TOOL_INVOKER, TRACE_PORT],
};

@Module({
  // TenantsController/OnboardingController 는 각 포트를 @Inject(TOKEN)
  // 데코레이터로 직접 주입받으므로(인터페이스 타입은 런타임에 없어 NestJS 가
  // 자동으로 해석할 수 없음) 표준 `controllers` 배열에 그대로 등록한다.
  controllers: [TenantsController, OnboardingController],
  providers: [
    ...defaultPortProviders,
    resolverProvider,
    customToolExecutorProvider,
  ],
  // TENANT_REPO/TENANT_AGENT_CONFIG_REPO 는 AuthModule(auth.controller.ts 의
  // POST /admin/tenants — 신규 테넌트+에이전트설정+계정 생성)이 재사용한다.
  exports: [TenantResolverService, CustomToolExecutor, TENANT_REPO, TENANT_AGENT_CONFIG_REPO],
})
export class TenantModule {}
