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
  KnowledgeItemId,
} from "@colli/contracts";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
} from "./tenant.ports.js";
import type { KnowledgeRepository, KnowledgeRecord } from "./ports.js";
import { PrismaKnowledgeRepository } from "./adapters/prisma.js";
import { TenantResolverService } from "./tenant-resolver.service.js";
import {
  TENANT_REPO,
  TENANT_AGENT_CONFIG_REPO,
  TENANT_INTENT_REPO,
  CUSTOM_TOOL_REPO,
  KNOWLEDGE_REPO,
} from "./tokens.js";
import {
  validateCustomToolName,
  validateParamsSchema,
  validateWebhookUrl,
  WebhookValidationError,
} from "./webhook-validation.js";

/** apps/console 의 KnowledgeItem shape (types.ts) — id/category/question/answer/tags/updatedAt. */
export interface KnowledgeItemDto {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags: string[];
  updatedAt: string;
}

function toKnowledgeItemDto(rec: KnowledgeRecord): KnowledgeItemDto {
  return {
    id: rec.id,
    category: rec.category,
    question: rec.question,
    answer: rec.answer,
    tags: rec.keywords,
    updatedAt: rec.updatedAt.toISOString(),
  };
}

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
    @Inject(KNOWLEDGE_REPO) private readonly knowledge: KnowledgeRepository,
    // 명시적 @Inject(TenantResolverService): esbuild(tsx) 는 emitDecoratorMetadata
    // 를 지원하지 않아 design:paramtypes 가 비어 NestJS 가 타입만으로 이 값을
    // 해석하지 못한다(라이브 서버를 tsx 로 직접 실행할 때 undefined 로 주입되는
    // 문제를 재현/수정). tsc 로 빌드한 dist 실행 시엔 원래도 타입 기반 해석이
    // 가능했지만, 명시적 @Inject 를 추가해도 무해하며 두 실행 경로 모두에서
    // 안전하게 동작한다.
    @Inject(TenantResolverService) private readonly resolver: TenantResolverService,
  ) {}

  /**
   * KB 라우트가 쓸 KnowledgeRepository 를 고른다.
   * DATA_ADAPTER=prisma 일 때는 DI 로 주입된 단일 인스턴스(KNOWLEDGE_REPO,
   * tenant.module.ts 상단 주석 참조) 대신 경로의 :id 로 직접 테넌트
   * 스코프된 PrismaKnowledgeRepository 를 만든다 — KnowledgeItem 이
   * tenantId 필수 FK 라 이렇게 해야 테넌트 격리가 보장된다. 그 외(인메모리/
   * 테스트)는 생성자로 주입된 인스턴스를 그대로 쓴다.
   */
  private kbRepoFor(tenantId: string): KnowledgeRepository {
    if (process.env.DATA_ADAPTER === "prisma") {
      return new PrismaKnowledgeRepository(tenantId as TenantId);
    }
    return this.knowledge;
  }

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

  // ── 테넌트 KB(FAQ) CRUD ──────────────────────────────────────
  // kbRepoFor(id) 로 요청마다 테넌트 스코프된 저장소를 얻는다(위 헬퍼 참조).
  @Get(":id/kb")
  async listKb(@Param("id") id: string): Promise<ApiResult<KnowledgeItemDto[]>> {
    const list = await this.kbRepoFor(id).list();
    return { ok: true, data: list.map(toKnowledgeItemDto) };
  }

  @Post(":id/kb")
  async createKb(
    @Param("id") id: string,
    @Body()
    body: {
      category: string;
      question: string;
      answer: string;
      tags?: string[];
    },
  ): Promise<ApiResult<KnowledgeItemDto>> {
    try {
      if (!body.category?.trim() || !body.question?.trim() || !body.answer?.trim()) {
        throw new WebhookValidationError(
          "invalid_params",
          "category, question, answer are required",
        );
      }
      const rec = await this.kbRepoFor(id).create({
        category: body.category as never,
        question: body.question,
        answer: body.answer,
        keywords: body.tags ?? [],
      });
      return { ok: true, data: toKnowledgeItemDto(rec) };
    } catch (err) {
      return errResult(err);
    }
  }

  @Put(":id/kb/:kbId")
  async updateKb(
    @Param("id") id: string,
    @Param("kbId") kbId: string,
    @Body()
    body: {
      category?: string;
      question?: string;
      answer?: string;
      tags?: string[];
    },
  ): Promise<ApiResult<KnowledgeItemDto>> {
    try {
      const repo = this.kbRepoFor(id);
      const existing = await repo.getById(kbId as KnowledgeItemId);
      if (!existing) {
        return { ok: false, error: { code: "kb_not_found", message: `no kb item: ${kbId}` } };
      }
      const rec = await repo.update(kbId as KnowledgeItemId, {
        category: body.category as never,
        question: body.question,
        answer: body.answer,
        keywords: body.tags,
      });
      return { ok: true, data: toKnowledgeItemDto(rec) };
    } catch (err) {
      return errResult(err);
    }
  }

  @Delete(":id/kb/:kbId")
  async deleteKb(
    @Param("id") id: string,
    @Param("kbId") kbId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    const repo = this.kbRepoFor(id);
    const existing = await repo.getById(kbId as KnowledgeItemId);
    if (!existing) {
      return { ok: true, data: { deleted: false } };
    }
    await repo.delete(kbId as KnowledgeItemId);
    return { ok: true, data: { deleted: true } };
  }
}
