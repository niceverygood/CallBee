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
import { prisma, Prisma } from "@colli/db";
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
  BusinessHours,
  AfterHoursMode,
  SmsSettings,
  CallDirection,
  Emotion,
  CallOutcome,
  SpeakerRole,
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
  CallSessionReadRepository,
  ListTenantCallsOptions,
  TenantCallListItem,
  TenantCallDetail,
  CallSessionIngestRepository,
  IngestCallSessionRef,
  CreateCallSessionInput,
  AppendTranscriptInput,
  CompleteCallSessionInput,
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
  industryKey: string | null;
  contactPhone: string | null;
  appliedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  rejectionReason: string | null;
}): TenantSummary {
  return {
    tenantId: rec.id as TenantId,
    slug: rec.slug,
    name: rec.name,
    industryLabel: rec.industryLabel,
    phoneNumber: rec.phoneNumber,
    status: rec.status as TenantStatus,
    plan: rec.plan as TenantPlan,
    industryKey: rec.industryKey,
    contactPhone: rec.contactPhone,
    appliedAt: rec.appliedAt ? rec.appliedAt.toISOString() : null,
    approvedAt: rec.approvedAt ? rec.approvedAt.toISOString() : null,
    rejectedAt: rec.rejectedAt ? rec.rejectedAt.toISOString() : null,
    rejectionReason: rec.rejectionReason,
  };
}

/** ISO8601 문자열(계약 컨벤션) ↔ Prisma DateTime 변환. undefined 는 그대로 통과(부분 patch). */
function toDateOrPassthrough(
  value: string | null | undefined,
): Date | null | undefined {
  if (value === undefined) return undefined;
  return value === null ? null : new Date(value);
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
        industryKey: input.industryKey ?? null,
        contactPhone: input.contactPhone ?? null,
        appliedAt: input.appliedAt ? new Date(input.appliedAt) : null,
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
      data: {
        name: patch.name,
        industryLabel: patch.industryLabel,
        phoneNumber: patch.phoneNumber,
        status: patch.status,
        plan: patch.plan,
        ownerEmail: patch.ownerEmail,
        industryKey: patch.industryKey,
        contactPhone: patch.contactPhone,
        appliedAt: toDateOrPassthrough(patch.appliedAt),
        approvedAt: toDateOrPassthrough(patch.approvedAt),
        rejectedAt: toDateOrPassthrough(patch.rejectedAt),
        rejectionReason: patch.rejectionReason,
      },
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
    const data = agentConfigDataFromInput(input);
    const rec = await this.db.tenantAgentConfig.upsert({
      where: { tenantId },
      update: data,
      create: { tenantId, ...data },
    });
    return toAgentConfig(tenantId, rec);
  }
}

/**
 * 계약 input → Prisma 데이터 매핑. v3 신규 optional 필드는 undefined 면
 * 아예 넘기지 않아(부분 미지정) 기존 값/DB 기본값이 유지된다.
 * Json 컬럼(businessHours/smsSettings)의 null 은 Prisma.DbNull 로 변환해야
 * 한다(Prisma 는 nullable Json 에 JS null 을 그대로 받지 않음).
 */
function agentConfigDataFromInput(input: UpsertTenantAgentConfigInput): {
  serviceName: string;
  agentName: string;
  greetingText: string | null;
  personaInstructions: string | null;
  toneExtra: string[];
  domainConstraints: string[];
  intentUnresolvedFallbackTool: string;
  maxIntentAttempts: number;
  closingText?: string | null;
  businessHours?: Prisma.InputJsonValue | typeof Prisma.DbNull;
  afterHoursMode?: string;
  afterHoursText?: string | null;
  transferPhoneNumber?: string | null;
  emergencyKeywords?: string[];
  smsSettings?: Prisma.InputJsonValue | typeof Prisma.DbNull;
} {
  return {
    serviceName: input.serviceName,
    agentName: input.agentName,
    greetingText: input.greetingText,
    personaInstructions: input.personaInstructions,
    toneExtra: input.toneExtra,
    domainConstraints: input.domainConstraints,
    intentUnresolvedFallbackTool: input.intentUnresolvedFallbackTool,
    maxIntentAttempts: input.maxIntentAttempts,
    ...(input.closingText !== undefined && { closingText: input.closingText }),
    ...(input.businessHours !== undefined && {
      businessHours:
        input.businessHours === null
          ? Prisma.DbNull
          : (input.businessHours as unknown as Prisma.InputJsonValue),
    }),
    ...(input.afterHoursMode !== undefined && { afterHoursMode: input.afterHoursMode }),
    ...(input.afterHoursText !== undefined && { afterHoursText: input.afterHoursText }),
    ...(input.transferPhoneNumber !== undefined && {
      transferPhoneNumber: input.transferPhoneNumber,
    }),
    ...(input.emergencyKeywords !== undefined && {
      emergencyKeywords: input.emergencyKeywords,
    }),
    ...(input.smsSettings !== undefined && {
      smsSettings:
        input.smsSettings === null
          ? Prisma.DbNull
          : (input.smsSettings as unknown as Prisma.InputJsonValue),
    }),
  };
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
    closingText: string | null;
    businessHours: unknown;
    afterHoursMode: string;
    afterHoursText: string | null;
    transferPhoneNumber: string | null;
    emergencyKeywords: string[];
    smsSettings: unknown;
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
    // ── v3 커스텀 확장(값이 없으면 null/기본값 — 골든 패리티는 dialogue 쪽 책임) ──
    closingText: rec.closingText,
    businessHours: (rec.businessHours as BusinessHours | null) ?? null,
    afterHoursMode: rec.afterHoursMode as AfterHoursMode,
    afterHoursText: rec.afterHoursText,
    transferPhoneNumber: rec.transferPhoneNumber,
    emergencyKeywords: rec.emergencyKeywords,
    smsSettings: (rec.smsSettings as SmsSettings | null) ?? null,
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

// ── 테넌트 통화 기록 읽기(콘솔 "통화 기록" 화면) ─────────────────
export class PrismaCallSessionReadRepository implements CallSessionReadRepository {
  constructor(private readonly db: Db = prisma) {}

  async listByTenant(
    tenantId: TenantId,
    options?: ListTenantCallsOptions,
  ): Promise<TenantCallListItem[]> {
    const rows = await this.db.callSession.findMany({
      where: { tenantId },
      orderBy: { startedAt: "desc" },
      take: options?.limit ?? 50,
      skip: options?.offset ?? 0,
    });
    return rows.map(toCallListItem);
  }

  async findByIdForTenant(
    tenantId: TenantId,
    callId: string,
  ): Promise<TenantCallDetail | null> {
    const rec = await this.db.callSession.findUnique({
      where: { id: callId },
      include: {
        transcripts: { orderBy: { createdAt: "asc" } },
        toolInvocations: { orderBy: { createdAt: "asc" } },
      },
    });
    // 타 테넌트 통화는 존재 자체를 숨긴다(null → call_not_found) — 격리 강제.
    if (!rec || rec.tenantId !== tenantId) return null;
    return {
      ...toCallListItem(rec),
      recordingUrl: rec.recordingUrl,
      summary: rec.summary,
      transcript: rec.transcripts.map((t) => ({
        role: t.role as SpeakerRole,
        text: t.text, // 저장 시점에 이미 PII 마스킹된 텍스트(Transcript 모델 주석)
        atSec: t.startMs != null ? Math.round(t.startMs / 1000) : 0,
      })),
      toolInvocations: rec.toolInvocations.map((t) => t.toolName),
    };
  }
}

// ── 통화 ingest 쓰기(음성 게이트웨이 /ingest/* 라우트) ────────────
/**
 * CallSessionIngestRepository Prisma 구현. PrismaCallSessionReadRepository 와
 * 같은 CallSession/Transcript 테이블에 쓰므로 콘솔 통화 기록 라우트가 ingest
 * 세션을 그대로 읽는다. clawopsCallId unique 를 멱등 키로 쓴다.
 */
export class PrismaCallSessionIngestRepository implements CallSessionIngestRepository {
  constructor(private readonly db: Db = prisma) {}

  async findByClawopsCallId(
    clawopsCallId: string,
  ): Promise<IngestCallSessionRef | null> {
    const rec = await this.db.callSession.findUnique({ where: { clawopsCallId } });
    return rec ? { callSessionId: rec.id, tenantId: rec.tenantId as TenantId } : null;
  }

  async create(
    tenantId: TenantId,
    input: CreateCallSessionInput,
  ): Promise<{ callSessionId: string }> {
    try {
      const rec = await this.db.callSession.create({
        data: {
          tenantId,
          clawopsCallId: input.clawopsCallId,
          fromNumber: input.fromNumber,
          toNumber: input.toNumber,
          startedAt: new Date(input.startedAt),
        },
      });
      return { callSessionId: rec.id };
    } catch (err) {
      // 동시 요청 레이스: clawopsCallId unique 충돌이면 기존 세션 반환(멱등).
      const existing = await this.findByClawopsCallId(input.clawopsCallId);
      if (existing) return { callSessionId: existing.callSessionId };
      throw err;
    }
  }

  async appendTranscript(
    callSessionId: string,
    input: AppendTranscriptInput,
  ): Promise<{ transcriptId: string } | null> {
    const session = await this.db.callSession.findUnique({
      where: { id: callSessionId },
      select: { id: true },
    });
    if (!session) return null;
    const rec = await this.db.transcript.create({
      data: {
        callSessionId,
        role: input.role,
        text: input.text, // 컨트롤러에서 maskPII 통과한 텍스트만 도달한다
        startMs: input.startMs ?? null,
      },
    });
    return { transcriptId: rec.id };
  }

  async complete(
    callSessionId: string,
    input: CompleteCallSessionInput,
  ): Promise<boolean> {
    const session = await this.db.callSession.findUnique({
      where: { id: callSessionId },
      select: { id: true },
    });
    if (!session) return false;
    await this.db.callSession.update({
      where: { id: callSessionId },
      data: {
        endedAt: new Date(input.endedAt),
        durationSec: input.durationSec,
        ...(input.outcome !== undefined && { outcome: input.outcome }),
        ...(input.summary !== undefined && { summary: input.summary }),
        ...(input.recordingUrl !== undefined && { recordingUrl: input.recordingUrl }),
      },
    });
    return true;
  }
}

function toCallListItem(rec: {
  id: string;
  clawopsCallId: string;
  fromNumber: string;
  toNumber: string;
  direction: string;
  intent: string | null;
  emotion: string | null;
  outcome: string | null;
  subscriberId: string | null;
  startedAt: Date;
  durationSec: number | null;
}): TenantCallListItem {
  return {
    id: rec.id,
    clawOpsCallId: rec.clawopsCallId,
    from: rec.fromNumber,
    to: rec.toNumber,
    direction: rec.direction as CallDirection,
    intent: rec.intent,
    emotion: rec.emotion as Emotion | null,
    outcome: rec.outcome as CallOutcome | null,
    subscriberId: rec.subscriberId,
    // 구독자 프로필 연동(BoBi read port)은 테넌트 일반화 범위 밖 — 항상 null.
    subscriberName: null,
    startedAt: rec.startedAt.toISOString(),
    durationSec: rec.durationSec ?? 0,
  };
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
