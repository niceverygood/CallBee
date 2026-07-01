/**
 * @colli/api 공개 표면(통합 배선용). Worker A/Orchestrator 가 여기서 import 한다.
 */
export { ToolsService, ToolError } from "./tools.service.js";
export type { ToolsDeps, ToolContext } from "./tools.service.js";
export * from "./ports.js";
export * from "./adapters/in-memory.js";
export * from "./tokens.js";
export { ToolsModule } from "./tools.module.js";
export { ToolsController } from "./tools.controller.js";
export { AppModule } from "./app.module.js";

// ── v2(멀티테넌트) 신규 공개 표면 ────────────────────────────────
// apps/voice 는 TenantResolverService(또는 GET /tenants/resolve HTTP 경로)를,
// apps/admin 은 TenantsController 가 노출하는 REST 경로(payload shape 는
// tenants.controller.ts 참조)를 소비한다.
export * from "./tenant.ports.js";
export * from "./adapters/tenant-in-memory.js";
export {
  TenantResolverService,
  buildRuntimeToolList,
  type TenantResolverDeps,
} from "./tenant-resolver.service.js";
export {
  CustomToolExecutor,
  type CustomToolExecutorDeps,
  type CustomToolInvokeContext,
  type CustomToolInvocationResult,
} from "./custom-tool-executor.service.js";
export {
  validateWebhookUrl,
  validateCustomToolName,
  validateParamsSchema,
  validateParamsAgainstSchema,
  WebhookValidationError,
} from "./webhook-validation.js";
export { TenantModule } from "./tenant.module.js";
export { TenantsController, type ApiResult } from "./tenants.controller.js";
