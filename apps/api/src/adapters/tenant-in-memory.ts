/**
 * 테넌트/커스텀tool 포트의 인메모리 구현(테스트/데모용).
 * 인프라(Postgres) 없이 동작한다. 실구현(Prisma)은 동일 포트 인터페이스로 스왑한다.
 */
import type {
  TenantId,
  TenantSummary,
  TenantIntentDefinition,
  TenantIntentKey,
  CustomToolDefinition,
  TenantToolId,
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
  WebhookToolInvoker,
  WebhookInvokeRequest,
  WebhookInvokeResponse,
  CallSessionReadRepository,
  TenantCallListItem,
  TenantCallDetail,
  ListTenantCallsOptions,
  CallSessionIngestRepository,
  IngestCallSessionRef,
  CreateCallSessionInput,
  AppendTranscriptInput,
  CompleteCallSessionInput,
} from "../tenant.ports.js";
import type { TenantAgentConfig as TenantAgentConfigContract } from "@colli/contracts";

// 간단한 증가 id 생성기(테스트 결정성). 실구현은 cuid(Prisma default).
function idGen(prefix: string): () => string {
  let n = 0;
  return () => `${prefix}_${++n}`;
}

/** 전화번호 정규화(공백·하이픈 제거). 매칭 안정화용. */
export function normalizeTenantPhone(phone: string): string {
  return phone.replace(/[\s-]/g, "");
}

// ── 테넌트 저장소 인메모리 ──────────────────────────────────────
export class InMemoryTenantRepository implements TenantRepository {
  private byId = new Map<string, TenantSummary>();
  private nextId = idGen("tenant");

  async create(input: CreateTenantInput): Promise<TenantSummary> {
    const existingSlug = [...this.byId.values()].find(
      (t) => t.slug === input.slug,
    );
    if (existingSlug) {
      throw new Error(`tenant slug already exists: ${input.slug}`);
    }
    const normalizedPhone = normalizeTenantPhone(input.phoneNumber);
    const existingPhone = [...this.byId.values()].find(
      (t) => normalizeTenantPhone(t.phoneNumber) === normalizedPhone,
    );
    if (existingPhone) {
      throw new Error(`tenant phoneNumber already exists: ${input.phoneNumber}`);
    }
    const tenant: TenantSummary = {
      tenantId: this.nextId() as TenantId,
      slug: input.slug,
      name: input.name,
      industryLabel: input.industryLabel ?? null,
      phoneNumber: input.phoneNumber,
      status: input.status ?? "onboarding",
      plan: input.plan ?? "trial",
      industryKey: input.industryKey ?? null,
      contactPhone: input.contactPhone ?? null,
      appliedAt: input.appliedAt ?? null,
      approvedAt: null,
      rejectedAt: null,
      rejectionReason: null,
    };
    this.byId.set(tenant.tenantId, tenant);
    return { ...tenant };
  }

  async findById(tenantId: TenantId): Promise<TenantSummary | null> {
    const t = this.byId.get(tenantId);
    return t ? { ...t } : null;
  }

  async findBySlug(slug: string): Promise<TenantSummary | null> {
    const t = [...this.byId.values()].find((x) => x.slug === slug);
    return t ? { ...t } : null;
  }

  async findByPhoneNumber(phoneNumber: string): Promise<TenantSummary | null> {
    const normalized = normalizeTenantPhone(phoneNumber);
    const t = [...this.byId.values()].find(
      (x) => normalizeTenantPhone(x.phoneNumber) === normalized,
    );
    return t ? { ...t } : null;
  }

  async update(
    tenantId: TenantId,
    patch: UpdateTenantInput,
  ): Promise<TenantSummary | null> {
    const cur = this.byId.get(tenantId);
    if (!cur) return null;
    const updated: TenantSummary = {
      ...cur,
      name: patch.name ?? cur.name,
      industryLabel:
        patch.industryLabel !== undefined ? patch.industryLabel : cur.industryLabel,
      phoneNumber: patch.phoneNumber ?? cur.phoneNumber,
      status: patch.status ?? cur.status,
      plan: patch.plan ?? cur.plan,
      industryKey: patch.industryKey !== undefined ? patch.industryKey : cur.industryKey,
      contactPhone:
        patch.contactPhone !== undefined ? patch.contactPhone : cur.contactPhone,
      appliedAt: patch.appliedAt !== undefined ? patch.appliedAt : cur.appliedAt,
      approvedAt: patch.approvedAt !== undefined ? patch.approvedAt : cur.approvedAt,
      rejectedAt: patch.rejectedAt !== undefined ? patch.rejectedAt : cur.rejectedAt,
      rejectionReason:
        patch.rejectionReason !== undefined
          ? patch.rejectionReason
          : cur.rejectionReason,
    };
    this.byId.set(tenantId, updated);
    return { ...updated };
  }

  async list(): Promise<TenantSummary[]> {
    return [...this.byId.values()].map((t) => ({ ...t }));
  }
}

// ── 테넌트 에이전트 설정 인메모리 ───────────────────────────────
export class InMemoryTenantAgentConfigRepository
  implements TenantAgentConfigRepository
{
  private store = new Map<string, TenantAgentConfigContract>();

  async get(tenantId: TenantId): Promise<TenantAgentConfigContract | null> {
    const c = this.store.get(tenantId);
    return c ? { ...c } : null;
  }

  async upsert(
    tenantId: TenantId,
    input: UpsertTenantAgentConfigInput,
  ): Promise<TenantAgentConfigContract> {
    const config: TenantAgentConfigContract = { tenantId, ...input };
    this.store.set(tenantId, config);
    return { ...config };
  }
}

// ── 테넌트 의도 카탈로그 인메모리 ───────────────────────────────
export class InMemoryTenantIntentRepository implements TenantIntentRepository {
  private store = new Map<string, TenantIntentDefinition[]>();

  async create(
    tenantId: TenantId,
    input: CreateTenantIntentInput,
  ): Promise<TenantIntentDefinition> {
    const list = this.store.get(tenantId) ?? [];
    if (list.some((i) => i.key === input.key)) {
      throw new Error(`tenant intent key already exists: ${input.key}`);
    }
    const intent: TenantIntentDefinition = {
      key: input.key as TenantIntentKey,
      label: input.label,
      keywords: input.keywords ?? [],
      routingToolName: input.routingToolName ?? null,
      sortOrder: input.sortOrder ?? list.length,
      enabled: input.enabled ?? true,
    };
    list.push(intent);
    this.store.set(tenantId, list);
    return { ...intent };
  }

  async findByKey(
    tenantId: TenantId,
    key: string,
  ): Promise<TenantIntentDefinition | null> {
    const list = this.store.get(tenantId) ?? [];
    const found = list.find((i) => i.key === key);
    return found ? { ...found } : null;
  }

  async list(tenantId: TenantId): Promise<TenantIntentDefinition[]> {
    const list = this.store.get(tenantId) ?? [];
    return [...list].sort((a, b) => a.sortOrder - b.sortOrder).map((i) => ({ ...i }));
  }

  async update(
    tenantId: TenantId,
    key: string,
    patch: UpdateTenantIntentInput,
  ): Promise<TenantIntentDefinition | null> {
    const list = this.store.get(tenantId) ?? [];
    const idx = list.findIndex((i) => i.key === key);
    if (idx === -1) return null;
    const cur = list[idx]!;
    const updated: TenantIntentDefinition = {
      ...cur,
      label: patch.label ?? cur.label,
      keywords: patch.keywords ?? cur.keywords,
      routingToolName:
        patch.routingToolName !== undefined
          ? patch.routingToolName
          : cur.routingToolName,
      sortOrder: patch.sortOrder ?? cur.sortOrder,
      enabled: patch.enabled ?? cur.enabled,
    };
    list[idx] = updated;
    this.store.set(tenantId, list);
    return { ...updated };
  }

  async delete(tenantId: TenantId, key: string): Promise<boolean> {
    const list = this.store.get(tenantId) ?? [];
    const idx = list.findIndex((i) => i.key === key);
    if (idx === -1) return false;
    list.splice(idx, 1);
    this.store.set(tenantId, list);
    return true;
  }
}

// ── 테넌트 커스텀 tool 인메모리 ─────────────────────────────────
export class InMemoryCustomToolRepository implements CustomToolRepository {
  private store = new Map<string, CustomToolDefinition>();
  private secrets = new Map<string, string>();
  private nextId = idGen("ttool");

  async create(
    tenantId: TenantId,
    input: CreateCustomToolInput,
  ): Promise<CustomToolDefinition> {
    const existing = [...this.store.values()].find(
      (t) => t.tenantId === tenantId && t.name === input.name,
    );
    if (existing) {
      throw new Error(`tenant tool name already exists: ${input.name}`);
    }
    const toolId = this.nextId() as TenantToolId;
    const tool: CustomToolDefinition = {
      toolId,
      tenantId,
      name: input.name,
      description: input.description,
      paramsSchema: input.paramsSchema,
      webhookUrl: input.webhookUrl,
      hasWebhookSecret: !!input.webhookSecret,
      timeoutMs: input.timeoutMs ?? 8000,
      enabled: input.enabled ?? true,
    };
    this.store.set(toolId, tool);
    if (input.webhookSecret) this.secrets.set(toolId, input.webhookSecret);
    return { ...tool };
  }

  async findByName(
    tenantId: TenantId,
    name: string,
  ): Promise<CustomToolDefinition | null> {
    const found = [...this.store.values()].find(
      (t) => t.tenantId === tenantId && t.name === name,
    );
    return found ? { ...found } : null;
  }

  async findById(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<CustomToolDefinition | null> {
    const found = this.store.get(toolId);
    if (!found || found.tenantId !== tenantId) return null;
    return { ...found };
  }

  async list(tenantId: TenantId): Promise<CustomToolDefinition[]> {
    return [...this.store.values()]
      .filter((t) => t.tenantId === tenantId)
      .map((t) => ({ ...t }));
  }

  async update(
    tenantId: TenantId,
    toolId: TenantToolId,
    patch: UpdateCustomToolInput,
  ): Promise<CustomToolDefinition | null> {
    const cur = this.store.get(toolId);
    if (!cur || cur.tenantId !== tenantId) return null;
    const updated: CustomToolDefinition = {
      ...cur,
      description: patch.description ?? cur.description,
      paramsSchema: patch.paramsSchema ?? cur.paramsSchema,
      webhookUrl: patch.webhookUrl ?? cur.webhookUrl,
      hasWebhookSecret:
        patch.webhookSecret !== undefined
          ? !!patch.webhookSecret
          : cur.hasWebhookSecret,
      timeoutMs: patch.timeoutMs ?? cur.timeoutMs,
      enabled: patch.enabled ?? cur.enabled,
    };
    this.store.set(toolId, updated);
    if (patch.webhookSecret !== undefined) {
      if (patch.webhookSecret) this.secrets.set(toolId, patch.webhookSecret);
      else this.secrets.delete(toolId);
    }
    return { ...updated };
  }

  async delete(tenantId: TenantId, toolId: TenantToolId): Promise<boolean> {
    const cur = this.store.get(toolId);
    if (!cur || cur.tenantId !== tenantId) return false;
    this.store.delete(toolId);
    this.secrets.delete(toolId);
    return true;
  }

  async getWebhookSecret(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<string | null> {
    const cur = this.store.get(toolId);
    if (!cur || cur.tenantId !== tenantId) return null;
    return this.secrets.get(toolId) ?? null;
  }
}

// ── 테넌트 통화 기록 읽기+ingest 인메모리 ───────────────────────
/**
 * CallSessionReadRepository + CallSessionIngestRepository 인메모리 구현
 * (테스트/데모용). 읽기/쓰기가 같은 store 를 공유하므로, 게이트웨이 ingest 로
 * 만든 세션을 콘솔 통화 기록 라우트가 그대로 읽는다(라이브의 "같은 테이블"
 * 동작과 정합). 테스트는 `seed(tenantId, detail)` 로도 직접 심을 수 있다.
 * 목록은 startedAt desc(최신순) 고정 정렬, limit 기본 50.
 */
export class InMemoryCallSessionReadRepository
  implements CallSessionReadRepository, CallSessionIngestRepository
{
  private byTenant = new Map<string, TenantCallDetail[]>();
  private nextId = idGen("call");
  private nextTranscriptId = idGen("tr");

  /** 테스트/데모용 시드. id 를 생략하면 자동 발급한다. */
  seed(
    tenantId: TenantId,
    call: Omit<TenantCallDetail, "id"> & { id?: string },
  ): TenantCallDetail {
    const detail: TenantCallDetail = {
      ...call,
      id: call.id ?? this.nextId(),
    };
    const list = this.byTenant.get(tenantId) ?? [];
    list.push(detail);
    this.byTenant.set(tenantId, list);
    return { ...detail };
  }

  async listByTenant(
    tenantId: TenantId,
    options?: ListTenantCallsOptions,
  ): Promise<TenantCallListItem[]> {
    const limit = options?.limit ?? 50;
    const offset = options?.offset ?? 0;
    const list = this.byTenant.get(tenantId) ?? [];
    return [...list]
      .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
      .slice(offset, offset + limit)
      .map(({ recordingUrl, summary, transcript, toolInvocations, ...item }) => ({
        ...item,
      }));
  }

  async findByIdForTenant(
    tenantId: TenantId,
    callId: string,
  ): Promise<TenantCallDetail | null> {
    const list = this.byTenant.get(tenantId) ?? [];
    const found = list.find((c) => c.id === callId);
    return found ? { ...found, transcript: [...found.transcript] } : null;
  }

  // ── CallSessionIngestRepository (음성 게이트웨이 쓰기 경로) ──────

  /** 전 테넌트를 스캔해 세션 참조를 찾는다(테스트 규모에서 충분). */
  private findRefById(callSessionId: string): {
    tenantId: string;
    detail: TenantCallDetail;
  } | null {
    for (const [tenantId, list] of this.byTenant) {
      const detail = list.find((c) => c.id === callSessionId);
      if (detail) return { tenantId, detail };
    }
    return null;
  }

  async findByClawopsCallId(
    clawopsCallId: string,
  ): Promise<IngestCallSessionRef | null> {
    for (const [tenantId, list] of this.byTenant) {
      const found = list.find((c) => c.clawOpsCallId === clawopsCallId);
      if (found) return { callSessionId: found.id, tenantId: tenantId as TenantId };
    }
    return null;
  }

  async create(
    tenantId: TenantId,
    input: CreateCallSessionInput,
  ): Promise<{ callSessionId: string }> {
    // 멱등: 동시 요청/재시도로 같은 clawopsCallId 가 또 오면 기존 세션 반환.
    const existing = await this.findByClawopsCallId(input.clawopsCallId);
    if (existing) return { callSessionId: existing.callSessionId };
    const detail = this.seed(tenantId, {
      clawOpsCallId: input.clawopsCallId,
      from: input.fromNumber,
      to: input.toNumber,
      direction: "inbound",
      intent: null,
      emotion: null,
      outcome: null,
      subscriberId: null,
      subscriberName: null,
      startedAt: input.startedAt,
      durationSec: 0,
      recordingUrl: null,
      summary: null,
      transcript: [],
      toolInvocations: [],
    });
    return { callSessionId: detail.id };
  }

  async appendTranscript(
    callSessionId: string,
    input: AppendTranscriptInput,
  ): Promise<{ transcriptId: string } | null> {
    const ref = this.findRefById(callSessionId);
    if (!ref) return null;
    ref.detail.transcript.push({
      role: input.role,
      text: input.text,
      atSec: input.startMs != null ? Math.round(input.startMs / 1000) : 0,
    });
    return { transcriptId: this.nextTranscriptId() };
  }

  async complete(
    callSessionId: string,
    input: CompleteCallSessionInput,
  ): Promise<boolean> {
    const ref = this.findRefById(callSessionId);
    if (!ref) return false;
    ref.detail.durationSec = input.durationSec;
    if (input.outcome !== undefined) ref.detail.outcome = input.outcome;
    if (input.summary !== undefined) ref.detail.summary = input.summary;
    if (input.recordingUrl !== undefined) ref.detail.recordingUrl = input.recordingUrl;
    // endedAt 은 읽기 뷰모델(TenantCallDetail)에 없는 필드 — 인메모리는 보관하지
    // 않는다(라이브 Prisma 구현은 CallSession.endedAt 컬럼에 저장).
    return true;
  }
}

// ── webhook tool 실행기 인메모리(목) ────────────────────────────
/**
 * 실HTTP 호출 없이 성공/실패/타임아웃 시나리오를 시뮬레이션하는 목.
 * 테스트에서 `respond(url, response)` / `forceTimeout(url)` / `forceError(url, err)`
 * 로 시나리오를 등록한 뒤 invoke() 로 검증한다. 등록되지 않은 URL 은 기본적으로
 * `{ ok:true, data:{ echoed: params } }` 를 반환한다(단순 성공 목).
 */
export class InMemoryWebhookToolInvoker implements WebhookToolInvoker {
  readonly calls: WebhookInvokeRequest[] = [];
  private scripted = new Map<string, () => Promise<WebhookInvokeResponse>>();

  /** 특정 webhookUrl 호출 시 반환할 고정 응답을 등록. */
  respond(webhookUrl: string, response: WebhookInvokeResponse): void {
    this.scripted.set(webhookUrl, async () => response);
  }

  /** 특정 webhookUrl 호출 시 timeoutMs 를 초과한 것처럼 시뮬레이션. */
  forceTimeout(webhookUrl: string): void {
    this.scripted.set(webhookUrl, async () => ({
      ok: false,
      error: { code: "webhook_timeout", message: "webhook timed out" },
    }));
  }

  /** 특정 webhookUrl 호출 시 네트워크/기타 오류를 시뮬레이션. */
  forceError(webhookUrl: string, code = "webhook_unreachable"): void {
    this.scripted.set(webhookUrl, async () => ({
      ok: false,
      error: { code, message: "webhook request failed" },
    }));
  }

  async invoke(req: WebhookInvokeRequest): Promise<WebhookInvokeResponse> {
    this.calls.push(req);
    const scripted = this.scripted.get(req.webhookUrl);
    if (scripted) return scripted();
    return { ok: true, data: { echoed: req.params } };
  }
}
