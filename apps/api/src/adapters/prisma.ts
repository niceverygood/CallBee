/**
 * Prisma 기반 실구현 어댑터(@colli/db). 인메모리 구현과 동일 포트를 만족한다.
 * 통합 시 ToolsModule 토큰을 이 클래스들로 override 하면 라이브 Postgres 로 스왑된다.
 *
 * 주의: 이 파일은 라이브 DB 없이도 타입체크/컴파일된다. 실행은 통합 단계에서만.
 * 테스트는 인메모리 구현을 쓰므로 이 파일에 의존하지 않는다.
 *
 * v2(멀티테넌트) 확장: schema.prisma 의 Ticket/KnowledgeItem/CallbackRequest/
 * ToolInvocation 은 전부 tenantId(필수) FK 를 갖는다(테넌트 격리 1차 방어선,
 * docs/tenant-platform-architecture.md §1.3). ports.ts 의 TicketRepository 등
 * 인터페이스 자체는 v1 그대로 유지하므로(ToolsService 가 이 시그니처만 신뢰),
 * 이 Prisma 어댑터는 "테넌트 스코프 인스턴스"로 만든다 — 생성자에서 tenantId 를
 * 받아 모든 쿼리에 자동으로 where/data 스코프를 건다. 통합 배선 시
 * ToolsModule 을 테넌트별로(또는 요청 스코프로) 인스턴스화할 때 이 tenantId 를
 * 주입한다(예: 미들웨어가 070 수신번호로 tenantId 를 해석한 뒤 request-scoped
 * provider 로 넘김 — 구체적 배선은 Orchestrator/apps/voice 통합 단계 결정).
 */
import { prisma, Prisma } from "@colli/db";
import type {
  TicketId,
  TicketStatus,
  KnowledgeItemId,
  CallbackId,
  CallbackStatus,
  CallSessionId,
  TenantId,
} from "@colli/contracts";
import type {
  TicketRepository,
  TicketRecord,
  CreateTicketInput,
  KnowledgeRepository,
  KnowledgeRecord,
  CreateKnowledgeInput,
  KnowledgeHit,
  CallbackRepository,
  CallbackRecord,
  EnqueueCallbackInput,
  TracePort,
  TraceEntry,
} from "../ports.js";

type Db = typeof prisma;

// ── 티켓 ────────────────────────────────────────────────────────
export class PrismaTicketRepository implements TicketRepository {
  constructor(
    private readonly tenantId: TenantId,
    private readonly db: Db = prisma,
  ) {}

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    const rec = await this.db.ticket.create({
      data: {
        tenantId: this.tenantId,
        callSessionId: input.callSessionId ?? null,
        subscriberId: input.subscriberId,
        category: input.category,
        summary: input.summary,
        severity: input.severity,
      },
    });
    return toTicketRecord(rec);
  }

  async findById(id: TicketId): Promise<TicketRecord | null> {
    const rec = await this.db.ticket.findUnique({
      where: { id, tenantId: this.tenantId },
    });
    return rec ? toTicketRecord(rec) : null;
  }

  async update(
    id: TicketId,
    patch: Partial<
      Pick<TicketRecord, "status" | "assignee" | "resolution" | "resolvedAt">
    >,
  ): Promise<TicketRecord | null> {
    const rec = await this.db.ticket.update({
      where: { id, tenantId: this.tenantId },
      data: patch,
    });
    return toTicketRecord(rec);
  }

  async list(filter?: {
    subscriberId?: string;
    status?: TicketStatus;
    category?: TicketRecord["category"];
  }): Promise<TicketRecord[]> {
    const rows = await this.db.ticket.findMany({
      where: {
        tenantId: this.tenantId,
        subscriberId: filter?.subscriberId,
        status: filter?.status,
        category: filter?.category,
      },
    });
    return rows.map(toTicketRecord);
  }
}

function toTicketRecord(rec: {
  id: string;
  callSessionId: string | null;
  subscriberId: string;
  category: string;
  summary: string;
  severity: string;
  status: string;
  assignee: string | null;
  resolution: string | null;
  resolvedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): TicketRecord {
  return {
    id: rec.id as TicketId,
    callSessionId: (rec.callSessionId as CallSessionId | null) ?? null,
    subscriberId: rec.subscriberId,
    category: rec.category as TicketRecord["category"],
    summary: rec.summary,
    severity: rec.severity as TicketRecord["severity"],
    status: rec.status as TicketStatus,
    assignee: rec.assignee,
    resolution: rec.resolution,
    resolvedAt: rec.resolvedAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

// ── 지식베이스 ──────────────────────────────────────────────────
export class PrismaKnowledgeRepository implements KnowledgeRepository {
  constructor(
    private readonly tenantId: TenantId,
    private readonly db: Db = prisma,
  ) {}

  async create(input: CreateKnowledgeInput): Promise<KnowledgeRecord> {
    const rec = await this.db.knowledgeItem.create({
      data: {
        tenantId: this.tenantId,
        category: input.category,
        question: input.question,
        answer: input.answer,
        keywords: input.keywords ?? [],
        enabled: input.enabled ?? true,
      },
    });
    return toKnowledgeRecord(rec);
  }

  async search(
    query: string,
    category?: KnowledgeRecord["category"],
  ): Promise<KnowledgeHit[]> {
    // DB 후보를 테넌트+카테고리로 좁혀 가져온 뒤, 앱단에서 키워드 점수 매칭.
    // (임베딩/전문검색으로 확장 가능. 계약상 confidence 만 유지되면 됨.)
    const rows = await this.db.knowledgeItem.findMany({
      where: { tenantId: this.tenantId, enabled: true, category },
    });
    const tokens = tokenize(query);
    const hits: KnowledgeHit[] = [];
    for (const row of rows) {
      const item = toKnowledgeRecord(row);
      const score = scoreMatch(tokens, item);
      if (score > 0) hits.push({ item, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  async list(
    category?: KnowledgeRecord["category"],
  ): Promise<KnowledgeRecord[]> {
    const rows = await this.db.knowledgeItem.findMany({
      where: { tenantId: this.tenantId, category },
    });
    return rows.map(toKnowledgeRecord);
  }

  async getById(id: KnowledgeItemId): Promise<KnowledgeRecord | null> {
    const rec = await this.db.knowledgeItem.findUnique({
      where: { id, tenantId: this.tenantId },
    });
    return rec ? toKnowledgeRecord(rec) : null;
  }

  async update(
    id: KnowledgeItemId,
    patch: Partial<CreateKnowledgeInput>,
  ): Promise<KnowledgeRecord> {
    const rec = await this.db.knowledgeItem.update({
      where: { id, tenantId: this.tenantId },
      data: {
        category: patch.category,
        question: patch.question,
        answer: patch.answer,
        keywords: patch.keywords,
        enabled: patch.enabled,
      },
    });
    return toKnowledgeRecord(rec);
  }

  async delete(id: KnowledgeItemId): Promise<void> {
    await this.db.knowledgeItem.delete({
      where: { id, tenantId: this.tenantId },
    });
  }
}

function toKnowledgeRecord(rec: {
  id: string;
  category: string;
  question: string;
  answer: string;
  keywords: string[];
  enabled: boolean;
  createdAt: Date;
  updatedAt: Date;
}): KnowledgeRecord {
  return {
    id: rec.id as KnowledgeItemId,
    category: rec.category as KnowledgeRecord["category"],
    question: rec.question,
    answer: rec.answer,
    keywords: rec.keywords,
    enabled: rec.enabled,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s,.?!·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

function scoreMatch(tokens: string[], item: KnowledgeRecord): number {
  if (tokens.length === 0) return 0;
  const hay = [
    ...item.keywords.map((k) => k.toLowerCase()),
    ...tokenize(item.question),
  ];
  const haySet = new Set(hay);
  let matches = 0;
  for (const t of tokens) {
    if (haySet.has(t) || hay.some((h) => h.includes(t) || t.includes(h)))
      matches++;
  }
  return matches / tokens.length;
}

// ── 콜백 큐 ─────────────────────────────────────────────────────
export class PrismaCallbackRepository implements CallbackRepository {
  constructor(
    private readonly tenantId: TenantId,
    private readonly db: Db = prisma,
  ) {}

  async enqueue(input: EnqueueCallbackInput): Promise<CallbackRecord> {
    const rec = await this.db.callbackRequest.create({
      data: {
        tenantId: this.tenantId,
        callSessionId: input.callSessionId ?? null,
        subscriberId: input.subscriberId ?? null,
        phone: input.phone ?? null,
        summary: input.summary,
        urgency: input.urgency,
      },
    });
    return toCallbackRecord(rec);
  }

  async findById(id: CallbackId): Promise<CallbackRecord | null> {
    const rec = await this.db.callbackRequest.findUnique({
      where: { id, tenantId: this.tenantId },
    });
    return rec ? toCallbackRecord(rec) : null;
  }

  async list(filter?: { status?: CallbackStatus }): Promise<CallbackRecord[]> {
    const rows = await this.db.callbackRequest.findMany({
      where: { tenantId: this.tenantId, status: filter?.status },
    });
    return rows.map(toCallbackRecord);
  }
}

function toCallbackRecord(rec: {
  id: string;
  callSessionId: string | null;
  subscriberId: string | null;
  phone: string | null;
  summary: string;
  urgency: string;
  status: string;
  scheduledAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CallbackRecord {
  return {
    id: rec.id as CallbackId,
    callSessionId: (rec.callSessionId as CallSessionId | null) ?? null,
    subscriberId: rec.subscriberId,
    phone: rec.phone,
    summary: rec.summary,
    urgency: rec.urgency as CallbackRecord["urgency"],
    status: rec.status as CallbackStatus,
    scheduledAt: rec.scheduledAt,
    completedAt: rec.completedAt,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
  };
}

// ── tool trace(관측성) ──────────────────────────────────────────
export class PrismaTrace implements TracePort {
  constructor(
    private readonly tenantId: TenantId,
    private readonly db: Db = prisma,
  ) {}

  async record(entry: TraceEntry): Promise<void> {
    // callSessionId 없는 직접 호출(통합 전)은 trace 스킵(스키마상 필수 FK).
    if (!entry.callSessionId) return;
    await this.db.toolInvocation.create({
      data: {
        tenantId: this.tenantId,
        callSessionId: entry.callSessionId,
        toolName: entry.toolName,
        // Prisma Json 입력 타입으로 좁힘(마스킹된 요약만; PII/결제정보 금지).
        paramsSummary:
          entry.paramsSummary == null
            ? Prisma.JsonNull
            : (entry.paramsSummary as Prisma.InputJsonValue),
        ok: entry.ok,
        errorCode: entry.errorCode ?? null,
        latencyMs: entry.latencyMs ?? null,
      },
    });
  }
}
