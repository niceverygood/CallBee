/**
 * TenantModule — 테넌트 CRUD + 커스텀tool 실행기 + 070 라우팅 조회를 조립하는
 * 얇은 NestJS 모듈(ToolsModule 과 동일 패턴).
 *
 * 기본 바인딩은 인메모리 어댑터(데모/로컬). 통합 시 Orchestrator/Worker A 가
 * 각 토큰을 실구현(Prisma repo / 실제 fetch 기반 webhook invoker)으로 override 한다.
 */
import { Module, type Provider } from "@nestjs/common";
import { TenantsController } from "./tenants.controller.js";
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
} from "./tokens.js";
import {
  InMemoryTenantRepository,
  InMemoryTenantAgentConfigRepository,
  InMemoryTenantIntentRepository,
  InMemoryCustomToolRepository,
  InMemoryWebhookToolInvoker,
} from "./adapters/tenant-in-memory.js";
import { InMemoryTrace } from "./adapters/in-memory.js";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
  WebhookToolInvoker,
} from "./tenant.ports.js";
import type { TracePort } from "./ports.js";

// 기본(인메모리) 포트 프로바이더. 통합 시 override.
const defaultPortProviders: Provider[] = [
  { provide: TENANT_REPO, useClass: InMemoryTenantRepository },
  { provide: TENANT_AGENT_CONFIG_REPO, useClass: InMemoryTenantAgentConfigRepository },
  { provide: TENANT_INTENT_REPO, useClass: InMemoryTenantIntentRepository },
  { provide: CUSTOM_TOOL_REPO, useClass: InMemoryCustomToolRepository },
  { provide: WEBHOOK_TOOL_INVOKER, useClass: InMemoryWebhookToolInvoker },
  // ToolsModule 이 이미 TRACE_PORT 를 바인딩하지만, TenantModule 을 단독으로도
  // 부트스트랩할 수 있도록 기본값을 여기서도 제공한다(NestJS 는 마지막 바인딩이 우선).
  { provide: TRACE_PORT, useClass: InMemoryTrace },
];

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
  // TenantsController 는 각 포트를 @Inject(TOKEN) 데코레이터로 직접 주입받으므로
  // (인터페이스 타입은 런타임에 없어 NestJS 가 자동으로 해석할 수 없음) 표준
  // `controllers` 배열에 그대로 등록한다.
  controllers: [TenantsController],
  providers: [
    ...defaultPortProviders,
    resolverProvider,
    customToolExecutorProvider,
  ],
  exports: [TenantResolverService, CustomToolExecutor],
})
export class TenantModule {}
