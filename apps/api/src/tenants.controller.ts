/**
 * 얇은 NestJS 컨트롤러: 테넌트 CRUD + 070 라우팅 조회 + 의도/커스텀tool CRUD.
 * apps/admin(console 워커)이 소비하는 경로/payload shape.
 * apps/voice 는 GET /tenants/resolve?toNumber=... 를 호출해 세션에 바인딩할
 * ResolvedTenantAgentContext 를 얻는다.
 *
 * 실제 로직은 전부 서비스/포트에 있다 — 컨트롤러는 HTTP 파라미터 파싱 +
 * 응답 shape 조립만 담당한다.
 */
import {
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Inject,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import {
  AFTER_HOURS_MODES,
  type AfterHoursMode,
  type TenantId,
  type TenantStatus,
  type TenantPlan,
  type ResolvedTenantAgentContext,
  type TenantSummary,
  type TenantAgentConfig,
  type TenantIntentDefinition,
  type CustomToolDefinition,
  type KnowledgeItemId,
} from "@colli/contracts";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
  CallSessionReadRepository,
  TenantCallListItem,
  TenantCallDetail,
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
  CALL_SESSION_READ_REPO,
} from "./tokens.js";
import {
  validateCustomToolName,
  validateParamsSchema,
  validateWebhookUrl,
  WebhookValidationError,
} from "./webhook-validation.js";
import { AuthGuard, type RequestWithAccount } from "./auth/auth.guard.js";
// 순환 아님: signup.controller.ts 는 이 파일에서 type(ApiResult)만 import 한다
// (type-only import 는 컴파일 시 제거되므로 런타임 순환 의존이 발생하지 않는다).
import { isValidPhoneNumberFormat } from "./signup.controller.js";

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

/** ?limit= 파싱 + 1~100 클램프(기본 50 — tenant.ports.ts 계약 주석 참조). */
function clampCallsLimit(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n)) return 50;
  return Math.min(100, Math.max(1, Math.trunc(n)));
}

/** ?offset= 파싱(음수/비숫자는 0). */
function clampCallsOffset(raw: string | undefined): number {
  const n = raw === undefined ? NaN : Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.trunc(n);
}

/**
 * PUT agent-config 의 v3 신규 필드 검증(worker-briefs §5).
 * - afterHoursMode: AFTER_HOURS_MODES 중 하나(미지정은 허용 — DB 기본 "callback").
 * - transferPhoneNumber: 숫자/하이픈 9~13자리(null/미지정은 "호전환 없음"으로 허용).
 * 실패 시 WebhookValidationError("invalid_params") → 응답 봉투 {ok:false,...}.
 */
function validateAgentConfigCustomFields(
  body: Omit<TenantAgentConfig, "tenantId">,
): void {
  if (
    body.afterHoursMode !== undefined &&
    !AFTER_HOURS_MODES.includes(body.afterHoursMode as AfterHoursMode)
  ) {
    throw new WebhookValidationError(
      "invalid_params",
      `afterHoursMode 는 AFTER_HOURS_MODES 중 하나여야 합니다: ${String(body.afterHoursMode)}`,
    );
  }
  if (
    body.transferPhoneNumber !== undefined &&
    body.transferPhoneNumber !== null &&
    !isValidPhoneNumberFormat(body.transferPhoneNumber)
  ) {
    throw new WebhookValidationError(
      "invalid_params",
      "transferPhoneNumber 는 숫자/하이픈만, 숫자 9~13자리여야 합니다",
    );
  }
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
    @Inject(CALL_SESSION_READ_REPO)
    private readonly callSessions: CallSessionReadRepository,
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

  /**
   * tenant_admin 이 자기 tenantId 와 다른 :id 스코프 라우트에 접근하면 403.
   * platform_admin 은 전부 허용. AuthGuard 가 req.account 를 부착한 뒤에만
   * 호출 가능(이 컨트롤러의 모든 :id 라우트는 @UseGuards(AuthGuard) 적용됨).
   */
  private assertTenantScope(req: RequestWithAccount, id: string): void {
    const account = req.account;
    if (!account) {
      // AuthGuard 를 반드시 거치므로 이론상 도달 불가 — 방어적으로 차단.
      throw new ForbiddenException({
        ok: false,
        error: { code: "forbidden", message: "authentication required" },
      });
    }
    if (account.role === "tenant_admin" && account.tenantId !== id) {
      throw new ForbiddenException({
        ok: false,
        error: { code: "forbidden_tenant_scope", message: `no access to tenant: ${id}` },
      });
    }
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

  @UseGuards(AuthGuard)
  @Get(":id")
  async getById(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
  ): Promise<ApiResult<TenantSummary>> {
    this.assertTenantScope(req, id);
    const tenant = await this.tenants.findById(id as TenantId);
    if (!tenant) {
      return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
    }
    return { ok: true, data: tenant };
  }

  @UseGuards(AuthGuard)
  @Put(":id")
  async update(
    @Req() req: RequestWithAccount,
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
    this.assertTenantScope(req, id);
    const tenant = await this.tenants.update(id as TenantId, body);
    if (!tenant) {
      return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
    }
    return { ok: true, data: tenant };
  }

  // ── 테넌트 에이전트 설정 ─────────────────────────────────────
  @UseGuards(AuthGuard)
  @Get(":id/agent-config")
  async getAgentConfig(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
  ): Promise<ApiResult<TenantAgentConfig>> {
    this.assertTenantScope(req, id);
    const config = await this.agentConfigs.get(id as TenantId);
    if (!config) {
      return { ok: false, error: { code: "agent_config_not_found", message: `no agent config for tenant: ${id}` } };
    }
    return { ok: true, data: config };
  }

  @UseGuards(AuthGuard)
  @Put(":id/agent-config")
  async putAgentConfig(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Body() body: Omit<TenantAgentConfig, "tenantId">,
  ): Promise<ApiResult<TenantAgentConfig>> {
    try {
      this.assertTenantScope(req, id);
      validateAgentConfigCustomFields(body);
      const config = await this.agentConfigs.upsert(id as TenantId, body);
      return { ok: true, data: config };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 테넌트 통화 기록 열람(콘솔 "통화 기록" 화면, product-spec §4.9) ──
  // AuthGuard + assertTenantScope — 테넌트는 자기 통화만 열람(타 테넌트 403).
  @UseGuards(AuthGuard)
  @Get(":id/calls")
  async listCalls(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Query("limit") limit?: string,
    @Query("offset") offset?: string,
  ): Promise<ApiResult<TenantCallListItem[]>> {
    // try 밖에서 호출 — ForbiddenException 이 그대로 전파되어 HTTP 403 이 된다
    // (try 안에서 잡히면 errResult 가 200 봉투로 삼켜버림).
    this.assertTenantScope(req, id);
    try {
      const list = await this.callSessions.listByTenant(id as TenantId, {
        limit: clampCallsLimit(limit),
        offset: clampCallsOffset(offset),
      });
      return { ok: true, data: list };
    } catch (err) {
      return errResult(err);
    }
  }

  @UseGuards(AuthGuard)
  @Get(":id/calls/:callId")
  async getCallDetail(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Param("callId") callId: string,
  ): Promise<ApiResult<TenantCallDetail>> {
    // try 밖에서 호출 — ForbiddenException 이 그대로 전파되어 HTTP 403 이 된다.
    this.assertTenantScope(req, id);
    try {
      // 타 테넌트 소유 통화는 저장소가 null 을 반환(존재 자체를 숨김 — 격리).
      const detail = await this.callSessions.findByIdForTenant(id as TenantId, callId);
      if (!detail) {
        return { ok: false, error: { code: "call_not_found", message: `no call: ${callId}` } };
      }
      return { ok: true, data: detail };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── 테넌트 의도 카탈로그 CRUD ────────────────────────────────
  @UseGuards(AuthGuard)
  @Get(":id/intents")
  async listIntents(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
  ): Promise<ApiResult<TenantIntentDefinition[]>> {
    this.assertTenantScope(req, id);
    const list = await this.intents.list(id as TenantId);
    return { ok: true, data: list };
  }

  @UseGuards(AuthGuard)
  @Post(":id/intents")
  async createIntent(
    @Req() req: RequestWithAccount,
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
      this.assertTenantScope(req, id);
      if (!body.key?.trim() || !body.label?.trim()) {
        throw new WebhookValidationError("invalid_params", "key, label are required");
      }
      const intent = await this.intents.create(id as TenantId, body);
      return { ok: true, data: intent };
    } catch (err) {
      return errResult(err);
    }
  }

  @UseGuards(AuthGuard)
  @Put(":id/intents/:key")
  async updateIntent(
    @Req() req: RequestWithAccount,
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
    this.assertTenantScope(req, id);
    const intent = await this.intents.update(id as TenantId, key, body);
    if (!intent) {
      return { ok: false, error: { code: "intent_not_found", message: `no intent: ${key}` } };
    }
    return { ok: true, data: intent };
  }

  @UseGuards(AuthGuard)
  @Delete(":id/intents/:key")
  async deleteIntent(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Param("key") key: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    this.assertTenantScope(req, id);
    const deleted = await this.intents.delete(id as TenantId, key);
    return { ok: true, data: { deleted } };
  }

  // ── 테넌트 커스텀 tool CRUD (SSRF 방지 검증 포함) ────────────
  @UseGuards(AuthGuard)
  @Get(":id/tools")
  async listTools(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
  ): Promise<ApiResult<CustomToolDefinition[]>> {
    this.assertTenantScope(req, id);
    const list = await this.customTools.list(id as TenantId);
    return { ok: true, data: list };
  }

  @UseGuards(AuthGuard)
  @Post(":id/tools")
  async createTool(
    @Req() req: RequestWithAccount,
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
      this.assertTenantScope(req, id);
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

  @UseGuards(AuthGuard)
  @Put(":id/tools/:toolId")
  async updateTool(
    @Req() req: RequestWithAccount,
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
      this.assertTenantScope(req, id);
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

  @UseGuards(AuthGuard)
  @Delete(":id/tools/:toolId")
  async deleteTool(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Param("toolId") toolId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    this.assertTenantScope(req, id);
    const deleted = await this.customTools.delete(id as TenantId, toolId as never);
    return { ok: true, data: { deleted } };
  }

  // ── 테넌트 KB(FAQ) CRUD ──────────────────────────────────────
  // kbRepoFor(id) 로 요청마다 테넌트 스코프된 저장소를 얻는다(위 헬퍼 참조).
  @UseGuards(AuthGuard)
  @Get(":id/kb")
  async listKb(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
  ): Promise<ApiResult<KnowledgeItemDto[]>> {
    this.assertTenantScope(req, id);
    const list = await this.kbRepoFor(id).list();
    return { ok: true, data: list.map(toKnowledgeItemDto) };
  }

  @UseGuards(AuthGuard)
  @Post(":id/kb")
  async createKb(
    @Req() req: RequestWithAccount,
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
      this.assertTenantScope(req, id);
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

  @UseGuards(AuthGuard)
  @Put(":id/kb/:kbId")
  async updateKb(
    @Req() req: RequestWithAccount,
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
      this.assertTenantScope(req, id);
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

  @UseGuards(AuthGuard)
  @Delete(":id/kb/:kbId")
  async deleteKb(
    @Req() req: RequestWithAccount,
    @Param("id") id: string,
    @Param("kbId") kbId: string,
  ): Promise<ApiResult<{ deleted: boolean }>> {
    this.assertTenantScope(req, id);
    const repo = this.kbRepoFor(id);
    const existing = await repo.getById(kbId as KnowledgeItemId);
    if (!existing) {
      return { ok: true, data: { deleted: false } };
    }
    await repo.delete(kbId as KnowledgeItemId);
    return { ok: true, data: { deleted: true } };
  }
}
