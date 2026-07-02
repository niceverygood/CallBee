/**
 * 테넌트/커스텀tool 테스트 하네스: 인메모리 포트로 서비스들을 조립한다(인프라 없이).
 */
import {
  InMemoryTenantRepository,
  InMemoryTenantAgentConfigRepository,
  InMemoryTenantIntentRepository,
  InMemoryCustomToolRepository,
  InMemoryWebhookToolInvoker,
  InMemoryCallSessionReadRepository,
} from "../adapters/tenant-in-memory.js";
import { InMemoryTrace, InMemoryKnowledgeRepository } from "../adapters/in-memory.js";
import { TenantResolverService } from "../tenant-resolver.service.js";
import { CustomToolExecutor } from "../custom-tool-executor.service.js";
import { TenantsController } from "../tenants.controller.js";
import type { RequestWithAccount } from "../auth/auth.guard.js";

/**
 * 이 파일의 테스트들은 NestJS DI/HTTP 를 거치지 않고 컨트롤러 메서드를 직접
 * 호출하므로 AuthGuard 는 발동하지 않는다 — 하지만 컨트롤러 메서드 시그니처
 * 자체는 `@Req() req: RequestWithAccount` 파라미터를 요구하므로(assertTenantScope
 * 가 req.account 를 읽는다), 테스트에서 전달할 목 platform_admin 요청 객체를
 * 제공한다(platform_admin 은 모든 tenantId 접근을 허용하므로 기존 테스트의
 * "여러 테넌트를 자유롭게 조회/수정" 시나리오와 충돌하지 않는다).
 */
export function mockPlatformAdminReq(): RequestWithAccount {
  return {
    account: {
      accountId: "admin_test_platform" as never,
      role: "platform_admin",
      tenantId: null,
    },
  } as unknown as RequestWithAccount;
}

/**
 * 특정 테넌트에 스코프된 tenant_admin 목 요청. assertTenantScope 가 자기
 * tenantId 와 다른 :id 접근을 403(ForbiddenException)으로 차단하는 시나리오
 * (통화 기록 테넌트 격리 등) 검증에 사용한다.
 */
export function mockTenantAdminReq(tenantId: string): RequestWithAccount {
  return {
    account: {
      accountId: `admin_test_${tenantId}` as never,
      role: "tenant_admin",
      tenantId,
    },
  } as unknown as RequestWithAccount;
}

export function makeTenantHarness() {
  const tenants = new InMemoryTenantRepository();
  const agentConfigs = new InMemoryTenantAgentConfigRepository();
  const intents = new InMemoryTenantIntentRepository();
  const customTools = new InMemoryCustomToolRepository();
  const webhookInvoker = new InMemoryWebhookToolInvoker();
  const trace = new InMemoryTrace();
  const knowledge = new InMemoryKnowledgeRepository();
  const callSessions = new InMemoryCallSessionReadRepository();

  const resolver = new TenantResolverService({
    tenants,
    agentConfigs,
    intents,
    customTools,
  });

  const executor = new CustomToolExecutor({
    customTools,
    webhookInvoker,
    trace,
  });

  const controller = new TenantsController(
    tenants,
    agentConfigs,
    intents,
    customTools,
    knowledge,
    resolver,
    callSessions,
  );

  return {
    tenants,
    agentConfigs,
    intents,
    customTools,
    webhookInvoker,
    trace,
    knowledge,
    callSessions,
    resolver,
    executor,
    controller,
  };
}
