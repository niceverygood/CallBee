/**
 * 테넌트/커스텀tool 테스트 하네스: 인메모리 포트로 서비스들을 조립한다(인프라 없이).
 */
import {
  InMemoryTenantRepository,
  InMemoryTenantAgentConfigRepository,
  InMemoryTenantIntentRepository,
  InMemoryCustomToolRepository,
  InMemoryWebhookToolInvoker,
} from "../adapters/tenant-in-memory.js";
import { InMemoryTrace, InMemoryKnowledgeRepository } from "../adapters/in-memory.js";
import { TenantResolverService } from "../tenant-resolver.service.js";
import { CustomToolExecutor } from "../custom-tool-executor.service.js";
import { TenantsController } from "../tenants.controller.js";

export function makeTenantHarness() {
  const tenants = new InMemoryTenantRepository();
  const agentConfigs = new InMemoryTenantAgentConfigRepository();
  const intents = new InMemoryTenantIntentRepository();
  const customTools = new InMemoryCustomToolRepository();
  const webhookInvoker = new InMemoryWebhookToolInvoker();
  const trace = new InMemoryTrace();
  const knowledge = new InMemoryKnowledgeRepository();

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
  );

  return {
    tenants,
    agentConfigs,
    intents,
    customTools,
    webhookInvoker,
    trace,
    knowledge,
    resolver,
    executor,
    controller,
  };
}
