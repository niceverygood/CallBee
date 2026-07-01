/**
 * 인메모리 포트 구현(테스트/데모용). 인프라(Postgres/Redis/Kakao) 없이 동작한다.
 * 실구현(Prisma/Redis/Worker D)은 동일 포트 인터페이스로 스왑한다.
 */
import type {
  SubscriberProfile,
  TicketId,
  TicketStatus,
  CallbackId,
  CallbackStatus,
  KnowledgeItemId,
  NotificationId,
  CallSessionId,
} from "@colli/contracts";
import type {
  BoBiReadPort,
  NotificationsPort,
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
  SessionStore,
  CallSessionState,
  TracePort,
  TraceEntry,
} from "../ports.js";

// 간단한 증가 id 생성기(테스트 결정성). 실구현은 cuid(Prisma default).
function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

// ── BoBi read 어댑터 목 ─────────────────────────────────────────
export class InMemoryBoBiRead implements BoBiReadPort {
  private byPhone = new Map<string, SubscriberProfile>();
  private byId = new Map<string, SubscriberProfile>();

  constructor(seed: SubscriberProfile[] = []) {
    for (const s of seed) this.seed(s);
  }

  /** 테스트 시드 헬퍼 */
  seed(profile: SubscriberProfile): void {
    this.byPhone.set(normalizePhone(profile.phone), profile);
    this.byId.set(profile.subscriberId, profile);
  }

  async findByPhone(phone: string): Promise<SubscriberProfile | null> {
    return this.byPhone.get(normalizePhone(phone)) ?? null;
  }

  async findById(subscriberId: string): Promise<SubscriberProfile | null> {
    return this.byId.get(subscriberId) ?? null;
  }
}

/** 전화번호 정규화(공백·하이픈 제거). 매칭 안정화용. */
export function normalizePhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

// ── 알림 목 (Worker D 대체) ─────────────────────────────────────
export class InMemoryNotifications implements NotificationsPort {
  readonly sent: Array<Parameters<NotificationsPort["send"]>[0]> = [];
  private nextId = idGen("ntf");
  /** 발송 결과를 강제(실패 테스트용) */
  forcedStatus: "sent" | "queued" | "failed" = "queued";

  async send(
    input: Parameters<NotificationsPort["send"]>[0],
  ): Promise<{ messageId: NotificationId; status: "sent" | "queued" | "failed" }> {
    this.sent.push(input);
    return {
      messageId: this.nextId() as NotificationId,
      status: this.forcedStatus,
    };
  }
}

// ── 티켓 저장소 인메모리 ────────────────────────────────────────
export class InMemoryTicketRepository implements TicketRepository {
  private store = new Map<string, TicketRecord>();
  private nextId = idGen("tkt");

  async create(input: CreateTicketInput): Promise<TicketRecord> {
    const now = new Date();
    const rec: TicketRecord = {
      id: this.nextId() as TicketId,
      callSessionId: input.callSessionId ?? null,
      subscriberId: input.subscriberId,
      category: input.category,
      summary: input.summary,
      severity: input.severity,
      status: "open",
      assignee: null,
      resolution: null,
      resolvedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(rec.id, rec);
    return { ...rec };
  }

  async findById(id: TicketId): Promise<TicketRecord | null> {
    const rec = this.store.get(id);
    return rec ? { ...rec } : null;
  }

  async update(
    id: TicketId,
    patch: Partial<
      Pick<TicketRecord, "status" | "assignee" | "resolution" | "resolvedAt">
    >,
  ): Promise<TicketRecord | null> {
    const rec = this.store.get(id);
    if (!rec) return null;
    const updated: TicketRecord = { ...rec, ...patch, updatedAt: new Date() };
    this.store.set(id, updated);
    return { ...updated };
  }

  async list(filter?: {
    subscriberId?: string;
    status?: TicketStatus;
    category?: TicketRecord["category"];
  }): Promise<TicketRecord[]> {
    let out = [...this.store.values()];
    if (filter?.subscriberId)
      out = out.filter((t) => t.subscriberId === filter.subscriberId);
    if (filter?.status) out = out.filter((t) => t.status === filter.status);
    if (filter?.category)
      out = out.filter((t) => t.category === filter.category);
    return out.map((t) => ({ ...t }));
  }
}

// ── KB 저장소 + 키워드/카테고리 검색 ───────────────────────────
export class InMemoryKnowledgeRepository implements KnowledgeRepository {
  private store = new Map<string, KnowledgeRecord>();
  private nextId = idGen("kb");

  constructor(seed: CreateKnowledgeInput[] = []) {
    for (const s of seed) void this.create(s);
  }

  async create(input: CreateKnowledgeInput): Promise<KnowledgeRecord> {
    const now = new Date();
    const rec: KnowledgeRecord = {
      id: this.nextId() as KnowledgeItemId,
      category: input.category,
      question: input.question,
      answer: input.answer,
      keywords: input.keywords ?? [],
      enabled: input.enabled ?? true,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(rec.id, rec);
    return { ...rec };
  }

  async search(
    query: string,
    category?: KnowledgeRecord["category"],
  ): Promise<KnowledgeHit[]> {
    const tokens = tokenize(query);
    const hits: KnowledgeHit[] = [];
    for (const item of this.store.values()) {
      if (!item.enabled) continue;
      if (category && item.category !== category) continue;
      const score = scoreMatch(tokens, item);
      if (score > 0) hits.push({ item: { ...item }, score });
    }
    hits.sort((a, b) => b.score - a.score);
    return hits;
  }

  async list(
    category?: KnowledgeRecord["category"],
  ): Promise<KnowledgeRecord[]> {
    let out = [...this.store.values()];
    if (category) out = out.filter((k) => k.category === category);
    return out.map((k) => ({ ...k }));
  }
}

function tokenize(s: string): string[] {
  return s
    .toLowerCase()
    .split(/[\s,.?!·]+/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);
}

/** 키워드/질문 텍스트 매칭 → 0~1 점수 */
function scoreMatch(tokens: string[], item: KnowledgeRecord): number {
  if (tokens.length === 0) return 0;
  const hay = [
    ...item.keywords.map((k) => k.toLowerCase()),
    ...tokenize(item.question),
  ];
  const haySet = new Set(hay);
  let matches = 0;
  for (const t of tokens) {
    if (haySet.has(t) || hay.some((h) => h.includes(t) || t.includes(h))) {
      matches++;
    }
  }
  return matches / tokens.length;
}

// ── 콜백 큐 인메모리 ────────────────────────────────────────────
export class InMemoryCallbackRepository implements CallbackRepository {
  private store = new Map<string, CallbackRecord>();
  private nextId = idGen("cb");

  async enqueue(input: EnqueueCallbackInput): Promise<CallbackRecord> {
    const now = new Date();
    const rec: CallbackRecord = {
      id: this.nextId() as CallbackId,
      callSessionId: input.callSessionId ?? null,
      subscriberId: input.subscriberId ?? null,
      phone: input.phone ?? null,
      summary: input.summary,
      urgency: input.urgency,
      status: "queued",
      scheduledAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now,
    };
    this.store.set(rec.id, rec);
    return { ...rec };
  }

  async findById(id: CallbackId): Promise<CallbackRecord | null> {
    const rec = this.store.get(id);
    return rec ? { ...rec } : null;
  }

  async list(filter?: { status?: CallbackStatus }): Promise<CallbackRecord[]> {
    let out = [...this.store.values()];
    if (filter?.status) out = out.filter((c) => c.status === filter.status);
    return out.map((c) => ({ ...c }));
  }
}

// ── 세션 스토어 인메모리(Redis 대체) ────────────────────────────
export class InMemorySessionStore implements SessionStore {
  private store = new Map<string, CallSessionState>();

  async get(callSessionId: CallSessionId): Promise<CallSessionState | null> {
    const s = this.store.get(callSessionId);
    return s ? { ...s } : null;
  }

  async set(
    callSessionId: CallSessionId,
    state: CallSessionState,
  ): Promise<void> {
    this.store.set(callSessionId, { ...state });
  }

  async patch(
    callSessionId: CallSessionId,
    patch: Partial<CallSessionState>,
  ): Promise<CallSessionState> {
    const cur = this.store.get(callSessionId) ?? {};
    const next = { ...cur, ...patch };
    this.store.set(callSessionId, next);
    return { ...next };
  }

  async delete(callSessionId: CallSessionId): Promise<void> {
    this.store.delete(callSessionId);
  }
}

// ── trace 포트 인메모리(관측성) ─────────────────────────────────
export class InMemoryTrace implements TracePort {
  readonly entries: TraceEntry[] = [];

  async record(entry: TraceEntry): Promise<void> {
    this.entries.push(entry);
  }
}
