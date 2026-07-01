/**
 * 얇은 NestJS 컨트롤러: 테넌트 CRUD + 070 라우팅 조회 + 의도/커스텀tool CRUD.
 * apps/admin(console 워커)이 소비하는 경로/payload shape.
 * apps/voice 는 GET /tenants/resolve?toNumber=... 를 호출해 세션에 바인딩할
 * ResolvedTenantAgentContext 를 얻는다.
 *
 * 실제 로직은 전부 서비스/포트에 있다 — 컨트롤러는 HTTP 파라미터 파싱 +
 * 응답 shape 조립만 담당한다.
 */
import { Body, Controller, Delete, Get, Inject, Param, Post, Put, Query } from "@nestjs/common";
import type {
  TenantId,
  TenantStatus,
  TenantPlan,
  ResolvedTenantAgentContext,
  TenantSummary,
  TenantAgentConfig,
  TenantIntentDefinition,
  CustomToolDefinition,
} from "@colli/contracts";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
} from "./tenant.ports.js";
import { TenantResolverService } from "./tenant-resolver.service.js";
import {
  TENANT_REPO,
  TENANT_AGENT_CONFIG_REPO,
  TENANT_INTENT_REPO,
  CUSTOM_TOOL_REPO,
} from "./tokens.js";
import {
  validateCustomToolName,
  validateParamsSchema,
  validateWebhookUrl,
  WebhookValidationError,
} from "./webhook-validation.js";

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: string; message: string } };

function errResult(err: unknown): ApiResult<never> {
  if (err instanceof WebhookValidationError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { ok: false, error: { code: "internal_error", message } };
}

@Controller("tenants")
export class TenantsController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(TENANT_AGENT_CONFIG_REPO)
    private readonly agentConfigs: TenantAgentConfigRepository,
    @Inject(TENANT_INTENT_REPO) private readonly intents: TenantIntentRepository,
    @Inject(CUSTOM_TOOL_REPO) private readonly customTools: CustomToolRepository,
    private readonly resolver: TenantResolverService,
  ) {}

  // ── 070 라우팅 조회(apps/voice 가 호출) ─────────────────────────
  @Get("resolve")
  async resolve(
    @Query("toNumber") toNumber: string,
  ): Promise<ApiResult<ResolvedTenantAgentContext>> {
    try {
      const ctx = await this.resolver.resolveByPhoneNumber(toNumber);
      if (!ctx) {
        return { ok: false, error: { code: "tenant_not_found", message: `no tenant for ${toNumber}` } };
      }
      return { ok: true, data: ctx };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 테넌트 CRUD ──────────────────────────────────────────────
  @Post()
  async create(
    @Body()
    body: {
      slug: string;
      name: string;
      industryLabel?: string | null;
      phoneNumber: string;
      status?: TenantStatus;
      plan?: TenantPlan;
      ownerEmail?: string | null;
    },
  ): Promise<ApiResult<TenantSummary>> {
    try {
      if (!body.slug?.trim() || !body.name?.trim() || !body.phoneNumber?.trim()) {
        throw new WebhookValidationError(
          "invalid_params",
          "slug, name, phoneNumber are required",
        );
      }
      const tenant = await this.tenants.create(body);
      return { ok: true, data: tenant };
    } catch (err) {
      return errResult(err);
    }
  }

  @Get(":id")
  async getById(@Param("id") id: string): Promise<ApiResult<TenantSummary>> {
    const tenant = await this.tenants.findById(id as TenantId);
    if (!tenant) {
      return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
    }
    return { ok: true, data: tenant };
  }

  @Put(":id")
  async update(
    @Param("id") id: string,
    @Body()
    body: {
      name?: string;
      industryLabel?: string | null;
      phoneNumber?: string;
      status?: TenantStatus;
      plan?: TenantPlan;
      ownerEmail?: string | null;
    },
  ): Promise<ApiResult<TenantSummary>> {
    const tenant = await this.tenants.update(id as TenantId, body);
    if (!tenant) {
      return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
    }
    return { ok: true, data: tenant };
  }

  // ── 테넌트 에이전트 설정 ─────────────────────────────────────
  @Get(":id/agent-config")
  async getAgentConfig(
    @Param("id") id: string,
  ): Promise<ApiResult<TenantAgentConfig>> {
    const config = await this.agentConfigs.get(id as TenantId);
    if (!config) {
      return { ok: false, error: { code: "agent_config_not_found", message: `no agent config for tenant: ${id}` } };
    }
    return { ok: true, data: config };
  }

  @Put(":id/agent-config")
  async putAgentConfig(
    @Param("id") id: string,
    @Body() body: Omit<TenantAgentConfig, "tenantId">,
  ): Promise<ApiResult<TenantAgentConfig>> {
    try {
      const config = await this.agentConfigs.upsert(id as TenantId, body);
      return { ok: true, data: config };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 테넌트 의도 카탈로그 CRUD ────────────────────────────────
  @Get(":id/intents")
  async listIntents(
    @Param("id") id: string,
  ): Promise<ApiResult<TenantIntentDefinition[]>> {
    const list = await this.intents.list(id as TenantId);
    return { ok: true, data: list };
  }

  @Post(":id/intents")
  async createIntent(
    @Param("id") id: string,
    @Body()
    body: {
      key: string;
      label: string;
      keywords?: string[];
      routingToolName?: string | null;
      sortOrder?: number;
      enabled?: boolean;
    },
  ): Promise<ApiResult<TenantIntentDefinition>> {
    try {
      if (!body.key?.trim() || !body.label?.trim()) {
        throw new WebhookValidationError("invalid_params", "key, label are required");
      }
      const intent = await this.intents.create(id as TenantId, body);
      return { ok: true, data: intent };
    } catch (err) {
      return errResult(err);
    }
  }

  @Put(":id/intents/:key")
  async updateIntent(
    @Param("id") id: string,
    @Param("key") key: string,
    @Body()
    body: {
      label?: string;
      keywords?: string[];
      routingToolName?: string | null;
      sortOrder?: number;
      enabled?: boolean;
    },
  ): Promise<ApiResult<TenantIntentDefinition>> {
    const intent = await this.intents.update(id as TenantId, key, body);
    if (!intent) {
      return { ok: false, error: { code: "intent_not_found", message: `no intent: ${key}` } };
    }
    return { ok: true, data: intent };
  }

  @Delete(":id/intents/:key")
  async deleteIntent(
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    const deleted = await this.intents.delete(id as TenantId, key);
    return { ok: true, data: { deleted } };
  }

  // ── 테넌트 커스텀 tool CRUD (SSRF 방지 검증 포함) ────────────
  @Get(":id/tools")
  async listTools(
    @Param("id") id: string,
  ): Promise<ApiResult<CustomToolDefinition[]>> {
    const list = await this.customTools.list(id as TenantId);
    return { ok: true, data: list };
  }

  @Post(":id/tools")
  async createTool(
    @Param("id") id: string,
    @Body()
    body: {
      name: string;
      description: string;
      paramsSchema: unknown;
      webhookUrl: string;
      webhookSecret?: string | null;
      timeoutMs?: number;
      enabled?: boolean;
    },
  ): Promise<ApiResult<CustomToolDefinition>> {
    try {
      validateCustomToolName(body.name);
      validateParamsSchema(body.paramsSchema);
      validateWebhookUrl(body.webhookUrl);
      const tool = await this.customTools.create(id as TenantId, {
        ...body,
        paramsSchema: body.paramsSchema,
      });
      return { ok: true, data: tool };
    } catch (err) {
      return errResult(err);
    }
  }

  @Put(":id/tools/:toolId")
  async updateTool(
    @Param("id") id: string,
    @Param("toolId") toolId: string,
    @Body()
    body: {
      description?: string;
      paramsSchema?: unknown;
      webhookUrl?: string;
      webhookSecret?: string | null;
      timeoutMs?: number;
      enabled?: boolean;
    },
  ): Promise<ApiResult<CustomToolDefinition>> {
    try {
      if (body.paramsSchema !== undefined) validateParamsSchema(body.paramsSchema);
      if (body.webhookUrl !== undefined) validateWebhookUrl(body.webhookUrl);
      const tool = await this.customTools.update(id as TenantId, toolId as never, {
        ...body,
        paramsSchema: body.paramsSchema,
      });
      if (!tool) {
        return { ok: false, error: { code: "tool_not_found", message: `no tool: ${toolId}` } };
      }
      return { ok: true, data: tool };
    } catch (err) {
      return errResult(err);
    }
  }

  @Delete(":id/tools/:toolId")
  async deleteTool(
    @Param("id") id: string,
    @Param("toolId") toolId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    const deleted = await this.customTools.delete(id as TenantId, toolId as never);
    return { ok: true, data: { deleted } };
  }
}
