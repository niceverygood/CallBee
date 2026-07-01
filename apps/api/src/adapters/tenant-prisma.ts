/**
 * Prisma 기반 테넌트/커스텀tool 포트 실구현(@colli/db). 인메모리 구현과 동일
 * 포트를 만족한다. 통합 시 TenantModule 토큰을 이 클래스들로 override 하면
 * 라이브 Postgres 로 스왑된다.
 *
 * 주의: 이 파일은 라이브 DB 없이도 타입체크/컴파일된다(prisma.ts 와 동일 원칙).
 * 실행은 마이그레이션 적용 이후 통합 단계에서만 이뤄진다. 테스트는 인메모리
 * 구현을 쓰므로 이 파일에 의존하지 않는다.
 *
 * webhookSecret 평문은 이 어댑터에서 저장/조회하지만, 운영 환경에서는
 * services/compliance 의 암호화 유틸로 감싼 뒤 저장해야 한다(docs 상 명시된
 * 운영 시 요구사항 — 이번 범위에서는 평문 그대로 두되 주석으로 남긴다).
 */
import { prisma } from "@colli/db";
import type {
  TenantId,
  TenantSummary,
  TenantStatus,
  TenantPlan,
  TenantAgentConfig as TenantAgentConfigContract,
  TenantIntentDefinition,
  TenantIntentKey,
  CustomToolDefinition,
  TenantToolId,
  JsonSchemaObject,
} from "@colli/contracts";
import type {
  TenantRepository,
  CreateTenantInput,
  UpdateTenantInput,
  TenantAgentConfigRepository,
  UpsertTenantAgentConfigInput,
  TenantIntentRepository,
  CreateTenantIntentInput,
  UpdateTenantIntentInput,
  CustomToolRepository,
  CreateCustomToolInput,
  UpdateCustomToolInput,
} from "../tenant.ports.js";

type Db = typeof prisma;

function toTenantSummary(rec: {
  id: string;
  slug: string;
  name: string;
  industryLabel: string | null;
  phoneNumber: string;
  status: string;
  plan: string;
}): TenantSummary {
  return {
    tenantId: rec.id as TenantId,
    slug: rec.slug,
    name: rec.name,
    industryLabel: rec.industryLabel,
    phoneNumber: rec.phoneNumber,
    status: rec.status as TenantStatus,
    plan: rec.plan as TenantPlan,
  };
}

// ── 테넌트 ──────────────────────────────────────────────────────
export class PrismaTenantRepository implements TenantRepository {
  constructor(private readonly db: Db = prisma) {}

  async create(input: CreateTenantInput): Promise<TenantSummary> {
    const rec = await this.db.tenant.create({
      data: {
        slug: input.slug,
        name: input.name,
        industryLabel: input.industryLabel ?? null,
        phoneNumber: input.phoneNumber,
        status: input.status,
        plan: input.plan,
        ownerEmail: input.ownerEmail ?? null,
      },
    });
    return toTenantSummary(rec);
  }

  async findById(tenantId: TenantId): Promise<TenantSummary | null> {
    const rec = await this.db.tenant.findUnique({ where: { id: tenantId } });
    return rec ? toTenantSummary(rec) : null;
  }

  async findBySlug(slug: string): Promise<TenantSummary | null> {
    const rec = await this.db.tenant.findUnique({ where: { slug } });
    return rec ? toTenantSummary(rec) : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<TenantSummary | null> {
    const rec = await this.db.tenant.findUnique({ where: { phoneNumber } });
    return rec ? toTenantSummary(rec) : null;
  }

  async update(
    tenantId: TenantId,
    patch: UpdateTenantInput,
  ): Promise<TenantSummary | null> {
    const rec = await this.db.tenant.update({
      where: { id: tenantId },
      data: patch,
    });
    return rec ? toTenantSummary(rec) : null;
  }

  async list(): Promise<TenantSummary[]> {
    const rows = await this.db.tenant.findMany();
    return rows.map(toTenantSummary);
  }
}

// ── 테넌트 에이전트 설정 ─────────────────────────────────────────
export class PrismaTenantAgentConfigRepository
  implements TenantAgentConfigRepository
{
  constructor(private readonly db: Db = prisma) {}

  async get(tenantId: TenantId): Promise<TenantAgentConfigContract | null> {
    const rec = await this.db.tenantAgentConfig.findUnique({
      where: { tenantId },
    });
    return rec ? toAgentConfig(tenantId, rec) : null;
  }

  async upsert(
    tenantId: TenantId,
    input: UpsertTenantAgentConfigInput,
  ): Promise<TenantAgentConfigContract> {
    const rec = await this.db.tenantAgentConfig.upsert({
      where: { tenantId },
      update: input,
      create: { tenantId, ...input },
    });
    return toAgentConfig(tenantId, rec);
  }
}

function toAgentConfig(
  tenantId: TenantId,
  rec: {
    serviceName: string;
    agentName: string;
    greetingText: string | null;
    personaInstructions: string | null;
    toneExtra: string[];
    domainConstraints: string[];
    intentUnresolvedFallbackTool: string;
    maxIntentAttempts: number;
  },
): TenantAgentConfigContract {
  return {
    tenantId,
    serviceName: rec.serviceName,
    agentName: rec.agentName,
    greetingText: rec.greetingText,
    personaInstructions: rec.personaInstructions,
    toneExtra: rec.toneExtra,
    domainConstraints: rec.domainConstraints,
    intentUnresolvedFallbackTool: rec.intentUnresolvedFallbackTool,
    maxIntentAttempts: rec.maxIntentAttempts,
  };
}

// ── 테넌트 의도 카탈로그 ─────────────────────────────────────────
export class PrismaTenantIntentRepository implements TenantIntentRepository {
  constructor(private readonly db: Db = prisma) {}

  async create(
    tenantId: TenantId,
    input: CreateTenantIntentInput,
  ): Promise<TenantIntentDefinition> {
    const rec = await this.db.tenantIntent.create({
      data: {
        tenantId,
        key: input.key,
        label: input.label,
        keywords: input.keywords ?? [],
        routingToolName: input.routingToolName ?? null,
        sortOrder: input.sortOrder ?? 0,
        enabled: input.enabled ?? true,
      },
    });
    return toIntentDefinition(rec);
  }

  async findByKey(
    tenantId: TenantId,
    key: string,
  ): Promise<TenantIntentDefinition | null> {
    const rec = await this.db.tenantIntent.findUnique({
      where: { tenantId_key: { tenantId, key } },
    });
    return rec ? toIntentDefinition(rec) : null;
  }

  async list(tenantId: TenantId): Promise<TenantIntentDefinition[]> {
    const rows = await this.db.tenantIntent.findMany({
      where: { tenantId },
      orderBy: { sortOrder: "asc" },
    });
    return rows.map(toIntentDefinition);
  }

  async update(
    tenantId: TenantId,
    key: string,
    patch: UpdateTenantIntentInput,
  ): Promise<TenantIntentDefinition | null> {
    const rec = await this.db.tenantIntent.update({
      where: { tenantId_key: { tenantId, key } },
      data: patch,
    });
    return rec ? toIntentDefinition(rec) : null;
  }

  async delete(tenantId: TenantId, key: string): Promise<boolean> {
    await this.db.tenantIntent.delete({
      where: { tenantId_key: { tenantId, key } },
    });
    return true;
  }
}

function toIntentDefinition(rec: {
  key: string;
  label: string;
  keywords: string[];
  routingToolName: string | null;
  sortOrder: number;
  enabled: boolean;
}): TenantIntentDefinition {
  return {
    key: rec.key as TenantIntentKey,
    label: rec.label,
    keywords: rec.keywords,
    routingToolName: rec.routingToolName,
    sortOrder: rec.sortOrder,
    enabled: rec.enabled,
  };
}

// ── 테넌트 커스텀 tool ────────────────────────────────────────────
export class PrismaCustomToolRepository implements CustomToolRepository {
  constructor(private readonly db: Db = prisma) {}

  async create(
    tenantId: TenantId,
    input: CreateCustomToolInput,
  ): Promise<CustomToolDefinition> {
    const rec = await this.db.tenantTool.create({
      data: {
        tenantId,
        name: input.name,
        description: input.description,
        paramsSchema: input.paramsSchema as object,
        webhookUrl: input.webhookUrl,
        // 운영 시 services/compliance 암호화 유틸로 감싼 값을 저장해야 한다.
        webhookSecret: input.webhookSecret ?? null,
        timeoutMs: input.timeoutMs ?? 8000,
        enabled: input.enabled ?? true,
      },
    });
    return toToolDefinition(rec);
  }

  async findByName(
    tenantId: TenantId,
    name: string,
  ): Promise<CustomToolDefinition | null> {
    const rec = await this.db.tenantTool.findUnique({
      where: { tenantId_name: { tenantId, name } },
    });
    return rec ? toToolDefinition(rec) : null;
  }

  async findById(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<CustomToolDefinition | null> {
    const rec = await this.db.tenantTool.findUnique({ where: { id: toolId } });
    if (!rec || rec.tenantId !== tenantId) return null;
    return toToolDefinition(rec);
  }

  async list(tenantId: TenantId): Promise<CustomToolDefinition[]> {
    const rows = await this.db.tenantTool.findMany({ where: { tenantId } });
    return rows.map(toToolDefinition);
  }

  async update(
    tenantId: TenantId,
    toolId: TenantToolId,
    patch: UpdateCustomToolInput,
  ): Promise<CustomToolDefinition | null> {
    const existing = await this.db.tenantTool.findUnique({ where: { id: toolId } });
    if (!existing || existing.tenantId !== tenantId) return null;
    const rec = await this.db.tenantTool.update({
      where: { id: toolId },
      data: {
        description: patch.description,
        paramsSchema: patch.paramsSchema as object | undefined,
        webhookUrl: patch.webhookUrl,
        webhookSecret: patch.webhookSecret,
        timeoutMs: patch.timeoutMs,
        enabled: patch.enabled,
      },
    });
    return toToolDefinition(rec);
  }

  async delete(tenantId: TenantId, toolId: TenantToolId): Promise<boolean> {
    const existing = await this.db.tenantTool.findUnique({ where: { id: toolId } });
    if (!existing || existing.tenantId !== tenantId) return false;
    await this.db.tenantTool.delete({ where: { id: toolId } });
    return true;
  }

  async getWebhookSecret(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<string | null> {
    const rec = await this.db.tenantTool.findUnique({ where: { id: toolId } });
    if (!rec || rec.tenantId !== tenantId) return null;
    // 운영 시 services/compliance 복호화 유틸을 여기서 거쳐야 한다.
    return rec.webhookSecret;
  }
}

function toToolDefinition(rec: {
  id: string;
  tenantId: string;
  name: string;
  description: string;
  paramsSchema: unknown;
  webhookUrl: string;
  webhookSecret: string | null;
  timeoutMs: number;
  enabled: boolean;
}): CustomToolDefinition {
  return {
    toolId: rec.id as TenantToolId,
    tenantId: rec.tenantId as TenantId,
    name: rec.name,
    description: rec.description,
    paramsSchema: rec.paramsSchema as JsonSchemaObject,
    webhookUrl: rec.webhookUrl,
    hasWebhookSecret: !!rec.webhookSecret,
    timeoutMs: rec.timeoutMs,
    enabled: rec.enabled,
  };
}
