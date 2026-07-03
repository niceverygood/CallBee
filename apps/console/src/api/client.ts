/**
 * API 클라이언트 레이어 — fixture(데모) 소스와 실제 fetch 소스를 토글.
 * apps/admin 의 src/api/client.ts 와 동일한 패턴(토글 규칙 동일).
 *
 * 토글 규칙:
 *   - import.meta.env.VITE_DATA_SOURCE === "fetch"  → 실제 백엔드(apps/api) 호출
 *   - 그 외(기본, dev 포함)                          → fixtures.ts 의 목 데이터
 *   - 베이스 URL: import.meta.env.VITE_API_BASE_URL (기본 "/api")
 *
 * 모든 엔드포인트는 tenantId 로 스코프된다(멀티테넌트 격리, 1차 방어선은
 * apps/api 몫이지만 콘솔은 항상 tenantId 를 경로에 포함해 호출한다).
 *
 * 인증: fetch 모드는 실제 로그인(POST /auth/login) 또는 가입(POST /signup)이
 * 필요하다. "현재 사업장 ID"는 로그인 후 저장된 세션(lib/session.ts)의
 * account.tenantId 에서 읽는다 — getCurrentTenantId() 참조. 데모(fixture) 모드는
 * 세션이 없으면 BoBi 데모 사업장으로 진입하고, /signup 데모 제출로 세션이 생기면
 * 그 세션의 사업장(승인 대기 데모)을 따른다 — 가입→대기 플로우를 데모로 체험 가능.
 */
import type {
  TenantSummary,
  TenantAgentConfig,
  TenantAgentConfigDraft,
  TenantIntentDefinition,
  TenantIntentDraft,
  CustomToolDefinition,
  CustomToolDraft,
  KnowledgeItem,
  KnowledgeItemDraft,
  TenantCallListItem,
  TenantCallDetail,
} from "./types";
import type {
  TenantIntentId,
  TenantToolId,
  LoginRequest,
  LoginResponse,
  KakaoLoginCallbackRequest,
  SignupRequest,
  SignupResult,
  AdminAccountSummary,
  ApplyIndustryTemplateResult,
  KnowledgeItemId,
} from "@colli/contracts";
import {
  findIndustryPreset,
  findIndustryTemplatePack,
  makePendingPhoneNumber,
  planIndustryTemplateApply,
} from "@colli/contracts";
import {
  TENANTS,
  AGENT_CONFIGS,
  INTENTS_BY_TENANT,
  TOOLS_BY_TENANT,
  KB_BY_TENANT,
  CALLS_BY_TENANT,
  BOBI_TENANT_ID,
  DEMO_PENDING_TENANT_ID,
} from "./fixtures";
import { getSession, getToken } from "../lib/session";

/** API 에러 — 봉투의 error.code 를 보존해 UI 가 케이스별 처리(§2.4 표)를 할 수 있게 한다. */
export class ApiError extends Error {
  readonly code: string;
  constructor(code: string, message: string) {
    super(message);
    this.name = "ApiError";
    this.code = code;
  }
}

export function apiErrorCode(error: unknown): string | null {
  return error instanceof ApiError ? error.code : null;
}

export interface ConsoleApi {
  login(req: LoginRequest): Promise<LoginResponse>;

  /** 카카오 로그인 콜백 code 교환 — POST /auth/kakao/callback */
  kakaoLogin(req: KakaoLoginCallbackRequest): Promise<LoginResponse>;

  /** 가입 위저드 3단계 제출(공개, 무인증) — POST /signup */
  signup(req: SignupRequest): Promise<SignupResult>;

  getTenant(tenantId: string): Promise<TenantSummary>;
  updateTenant(tenantId: string, patch: Partial<TenantSummary>): Promise<TenantSummary>;

  getAgentConfig(tenantId: string): Promise<TenantAgentConfig>;
  updateAgentConfig(
    tenantId: string,
    draft: TenantAgentConfigDraft,
  ): Promise<TenantAgentConfig>;

  listIntents(tenantId: string): Promise<TenantIntentDefinition[]>;
  createIntent(
    tenantId: string,
    draft: TenantIntentDraft,
  ): Promise<TenantIntentDefinition>;
  updateIntent(
    tenantId: string,
    intentId: string,
    draft: TenantIntentDraft,
  ): Promise<TenantIntentDefinition>;
  deleteIntent(tenantId: string, intentId: string): Promise<void>;

  listTools(tenantId: string): Promise<CustomToolDefinition[]>;
  createTool(tenantId: string, draft: CustomToolDraft): Promise<CustomToolDefinition>;
  updateTool(
    tenantId: string,
    toolId: string,
    draft: CustomToolDraft,
  ): Promise<CustomToolDefinition>;
  deleteTool(tenantId: string, toolId: string): Promise<void>;

  /**
   * 업종 팩 적용(비파괴 merge) — POST /tenants/:id/industry-template.
   * industryKey 미지정이면 가입 업종의 팩을 적용한다.
   */
  applyIndustryTemplate(
    tenantId: string,
    industryKey?: string | null,
  ): Promise<ApplyIndustryTemplateResult>;

  listKb(tenantId: string): Promise<KnowledgeItem[]>;
  createKb(tenantId: string, draft: KnowledgeItemDraft): Promise<KnowledgeItem>;
  updateKb(
    tenantId: string,
    kbId: string,
    patch: Partial<KnowledgeItemDraft>,
  ): Promise<KnowledgeItem>;
  deleteKb(tenantId: string, kbId: string): Promise<void>;

  listCalls(
    tenantId: string,
    opts?: { limit?: number; offset?: number },
  ): Promise<TenantCallListItem[]>;
  getCall(tenantId: string, callId: string): Promise<TenantCallDetail>;
}

// ── 환경 토글 ───────────────────────────────────────────────────
const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE as string | undefined) ?? "fixture";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const IS_FIXTURE = DATA_SOURCE !== "fetch";

/**
 * 데모(fixture) 모드 기본 사업장 ID(BoBi 목 데이터). 세션 없이 진입하면
 * 이 사업장으로 고정된다 — 기존 렌더 테스트가 의존하는 값이다.
 */
export const FIXTURE_TENANT_ID: string = BOBI_TENANT_ID as unknown as string;

/**
 * "현재 사업장 ID".
 * - fetch 모드: 로그인 후 저장된 세션(lib/session.ts)의 account.tenantId.
 *               로그인 전이면 null(라우트 가드가 /login 으로 보낸다).
 * - 데모 모드: 세션이 있으면(가입 데모 제출) 그 사업장, 없으면 BoBi 데모 사업장.
 */
export function getCurrentTenantId(): string | null {
  const sessionTenantId = getSession()?.account.tenantId;
  if (sessionTenantId) return String(sessionTenantId);
  return IS_FIXTURE ? FIXTURE_TENANT_ID : null;
}

// ── Fixture 구현 (dev 기본) ─────────────────────────────────────
function makeFixtureApi(): ConsoleApi {
  const tenants = TENANTS.map((t) => ({ ...t }));
  const agentConfigs: Record<string, TenantAgentConfig> = Object.fromEntries(
    Object.entries(AGENT_CONFIGS).map(([k, v]) => [
      k,
      {
        ...v,
        toneExtra: [...v.toneExtra],
        domainConstraints: [...v.domainConstraints],
        emergencyKeywords: [...(v.emergencyKeywords ?? [])],
      },
    ]),
  );
  const intents: Record<string, TenantIntentDefinition[]> = Object.fromEntries(
    Object.entries(INTENTS_BY_TENANT).map(([k, v]) => [
      k,
      v.map((i) => ({ ...i, keywords: [...i.keywords] })),
    ]),
  );
  const tools: Record<string, CustomToolDefinition[]> = Object.fromEntries(
    Object.entries(TOOLS_BY_TENANT).map(([k, v]) => [k, v.map((t) => ({ ...t }))]),
  );
  const kb: Record<string, KnowledgeItem[]> = Object.fromEntries(
    Object.entries(KB_BY_TENANT).map(([k, v]) => [
      k,
      v.map((item) => ({ ...item, tags: [...item.tags] })),
    ]),
  );
  const calls: Record<string, TenantCallDetail[]> = Object.fromEntries(
    Object.entries(CALLS_BY_TENANT).map(([k, v]) => [
      k,
      v.map((c) => ({
        ...c,
        transcript: c.transcript.map((s) => ({ ...s })),
        toolInvocations: [...c.toolInvocations],
      })),
    ]),
  );

  let toolSeq = 1000;
  let kbSeq = 1000;

  const delay = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), 120));

  const findTenant = (id: string) => {
    const t = tenants.find((x) => String(x.tenantId) === id);
    if (!t) throw new ApiError("not_found", `사업장을 찾을 수 없어요: ${id}`);
    return t;
  };

  return {
    // 데모 모드는 로그인 화면을 건너뛰므로 실제로 호출되지 않는다(인터페이스 충족용).
    login: () =>
      Promise.reject(
        new ApiError("unsupported", "로그인은 데모 모드에서 지원하지 않아요."),
      ),

    kakaoLogin: () =>
      Promise.reject(
        new ApiError("unsupported", "카카오 로그인은 fetch 모드에서 사용할 수 있어요."),
      ),

    /**
     * 가입 데모: 승인 대기 데모 사업장(DEMO_PENDING_TENANT_ID)에 입력값을
     * 덮어쓰고(인메모리) 그 사업장으로 로그인되는 세션 토큰을 돌려준다.
     * 새로고침하면 기본값으로 복원된다(fixtures.ts 주석 참조).
     */
    signup: (req) => {
      const t = findTenant(String(DEMO_PENDING_TENANT_ID));
      const slug =
        req.businessName.trim().toLowerCase().replace(/\s+/g, "-") || "new-business";
      const preset = findIndustryPreset(req.industryKey);
      t.name = req.businessName;
      t.slug = slug;
      t.industryKey = req.industryKey;
      t.industryLabel =
        req.industryKey === "other"
          ? (req.industryCustomLabel ?? "기타")
          : (preset?.label ?? req.industryKey);
      t.contactPhone = req.contactPhone;
      t.plan = req.plan;
      t.status = "pending_approval";
      t.phoneNumber = makePendingPhoneNumber(slug);
      t.appliedAt = new Date().toISOString();
      t.rejectionReason = null;
      t.rejectedAt = null;

      const cfg = agentConfigs[String(DEMO_PENDING_TENANT_ID)];
      if (cfg) {
        cfg.serviceName = req.businessName;
        cfg.agentName = "상담원";
      }

      const account: AdminAccountSummary = {
        accountId: "acct_demo_pending" as AdminAccountSummary["accountId"],
        email: req.email,
        role: "tenant_admin",
        tenantId: DEMO_PENDING_TENANT_ID,
        createdAt: new Date().toISOString(),
      };
      return delay({
        tenantId: DEMO_PENDING_TENANT_ID,
        account,
        tenantStatus: "pending_approval" as const,
        token: "demo-signup-token",
      });
    },

    getTenant: (id) => delay({ ...findTenant(id) }),
    updateTenant: (id, patch) => {
      const t = findTenant(id);
      Object.assign(t, patch);
      return delay({ ...t });
    },

    getAgentConfig: (id) => {
      const cfg = agentConfigs[id];
      if (!cfg)
        return Promise.reject(
          new ApiError("not_found", `AI 상담원 설정을 찾을 수 없어요: ${id}`),
        );
      return delay({
        ...cfg,
        toneExtra: [...cfg.toneExtra],
        domainConstraints: [...cfg.domainConstraints],
        emergencyKeywords: [...(cfg.emergencyKeywords ?? [])],
      });
    },
    updateAgentConfig: (id, draft) => {
      const next: TenantAgentConfig = {
        tenantId: id as unknown as TenantAgentConfig["tenantId"],
        ...draft,
        toneExtra: [...draft.toneExtra],
        domainConstraints: [...draft.domainConstraints],
        emergencyKeywords: [...(draft.emergencyKeywords ?? [])],
      };
      agentConfigs[id] = next;
      return delay({
        ...next,
        toneExtra: [...next.toneExtra],
        domainConstraints: [...next.domainConstraints],
        emergencyKeywords: [...(next.emergencyKeywords ?? [])],
      });
    },

    listIntents: (id) => delay((intents[id] ?? []).map((i) => ({ ...i, keywords: [...i.keywords] }))),
    createIntent: (id, draft) => {
      const list = intents[id] ?? (intents[id] = []);
      const item: TenantIntentDefinition = {
        ...draft,
        key: draft.key as TenantIntentDefinition["key"],
        keywords: [...draft.keywords],
      };
      list.push(item);
      return delay({ ...item, keywords: [...item.keywords] });
    },
    updateIntent: (id, intentIdParam, draft) => {
      const list = intents[id] ?? [];
      const idx = list.findIndex((x) => String(x.key) === intentIdParam);
      if (idx === -1)
        return Promise.reject(new ApiError("not_found", `문의 유형을 찾을 수 없어요: ${intentIdParam}`));
      const updated: TenantIntentDefinition = {
        ...draft,
        key: draft.key as TenantIntentDefinition["key"],
        keywords: [...draft.keywords],
      };
      list[idx] = updated;
      return delay({ ...updated, keywords: [...updated.keywords] });
    },
    deleteIntent: (id, intentIdParam) => {
      const list = intents[id] ?? [];
      intents[id] = list.filter((x) => String(x.key) !== intentIdParam);
      return delay(undefined);
    },

    listTools: (id) => delay((tools[id] ?? []).map((t) => ({ ...t }))),
    createTool: (id, draft) => {
      const list = tools[id] ?? (tools[id] = []);
      const item: CustomToolDefinition = {
        toolId: `tool_${toolSeq++}` as unknown as TenantToolId,
        tenantId: id as unknown as CustomToolDefinition["tenantId"],
        name: draft.name,
        description: draft.description,
        paramsSchema: draft.paramsSchema,
        webhookUrl: draft.webhookUrl,
        hasWebhookSecret: !!draft.webhookSecret,
        timeoutMs: draft.timeoutMs,
        enabled: draft.enabled,
      };
      list.push(item);
      return delay({ ...item });
    },
    updateTool: (id, toolIdParam, draft) => {
      const list = tools[id] ?? [];
      const idx = list.findIndex((x) => String(x.toolId) === toolIdParam);
      if (idx === -1)
        return Promise.reject(new ApiError("not_found", `연동을 찾을 수 없어요: ${toolIdParam}`));
      const existing = list[idx]!;
      const updated: CustomToolDefinition = {
        ...existing,
        name: draft.name,
        description: draft.description,
        paramsSchema: draft.paramsSchema,
        webhookUrl: draft.webhookUrl,
        hasWebhookSecret: draft.webhookSecret ? true : existing.hasWebhookSecret,
        timeoutMs: draft.timeoutMs,
        enabled: draft.enabled,
      };
      list[idx] = updated;
      return delay({ ...updated });
    },
    deleteTool: (id, toolIdParam) => {
      const list = tools[id] ?? [];
      tools[id] = list.filter((x) => String(x.toolId) !== toolIdParam);
      return delay(undefined);
    },

    // 실서버(industry-template.service.ts)와 같은 planner 를 써서 데모에서도
    // 동일한 비파괴 merge 의미론을 재현한다(계획 로직은 @colli/contracts 단일 소스).
    applyIndustryTemplate: (id, industryKeyOverride) => {
      const t = findTenant(id);
      const key = industryKeyOverride?.trim() || t.industryKey || null;
      const pack = findIndustryTemplatePack(key);
      if (!pack) {
        return Promise.reject(
          new ApiError(
            "template_not_found",
            `이 업종은 아직 템플릿 팩이 없어요: ${key ?? "(업종 미지정)"}`,
          ),
        );
      }
      const cfg = agentConfigs[id] ?? null;
      const intentList = intents[id] ?? (intents[id] = []);
      const kbList = kb[id] ?? (kb[id] = []);

      const plan = planIndustryTemplateApply(pack, {
        serviceName: cfg?.serviceName ?? t.name,
        agentConfig: cfg,
        existingIntents: intentList.map((i) => ({
          key: String(i.key),
          sortOrder: i.sortOrder,
        })),
        existingKbQuestions: kbList.map((k) => k.question),
      });

      if (plan.agentConfigChanged) {
        agentConfigs[id] = {
          tenantId: id as unknown as TenantAgentConfig["tenantId"],
          ...plan.agentConfig,
          toneExtra: [...plan.agentConfig.toneExtra],
          domainConstraints: [...plan.agentConfig.domainConstraints],
          emergencyKeywords: [...(plan.agentConfig.emergencyKeywords ?? [])],
        };
      }
      for (const intent of plan.intentsToCreate) {
        intentList.push({
          key: intent.key as TenantIntentDefinition["key"],
          label: intent.label,
          keywords: [...intent.keywords],
          routingToolName: intent.routingToolName,
          sortOrder: intent.sortOrder,
          enabled: intent.enabled,
        });
      }
      const createdKbQuestionsNeedingAnswer: string[] = [];
      const createdKbQuestionsEnabled: string[] = [];
      for (const item of plan.kbToCreate) {
        kbList.unshift({
          id: `kb_pack_${kbSeq++}` as unknown as KnowledgeItemId,
          category: item.category,
          question: item.question,
          answer: item.answer,
          tags: [...item.keywords],
          enabled: item.enabled,
          updatedAt: new Date().toISOString(),
        });
        (item.enabled ? createdKbQuestionsEnabled : createdKbQuestionsNeedingAnswer).push(
          item.question,
        );
      }
      return delay({
        industryKey: pack.industryKey,
        packTitle: pack.title,
        agentConfigCreated: plan.agentConfigCreated,
        agentConfigUpdated: plan.agentConfigChanged && !plan.agentConfigCreated,
        createdIntentKeys: plan.intentsToCreate.map((i) => i.key),
        skippedIntentKeys: plan.skippedIntentKeys,
        createdKbQuestionsNeedingAnswer,
        createdKbQuestionsEnabled,
        skippedKbQuestions: plan.skippedKbQuestions,
      });
    },

    listKb: (id) => delay((kb[id] ?? []).map((k) => ({ ...k, tags: [...k.tags] }))),
    createKb: (id, draft) => {
      const list = kb[id] ?? (kb[id] = []);
      const item: KnowledgeItem = {
        ...draft,
        tags: [...draft.tags],
        id: `kb_new_${kbSeq++}` as unknown as KnowledgeItem["id"],
        updatedAt: new Date().toISOString(),
      };
      list.unshift(item);
      return delay({ ...item, tags: [...item.tags] });
    },
    updateKb: (id, kbIdParam, patch) => {
      const list = kb[id] ?? [];
      const idx = list.findIndex((x) => String(x.id) === kbIdParam);
      if (idx === -1)
        return Promise.reject(new ApiError("not_found", `자주 묻는 질문을 찾을 수 없어요: ${kbIdParam}`));
      const updated = { ...list[idx]!, ...patch, updatedAt: new Date().toISOString() };
      list[idx] = updated;
      return delay({ ...updated, tags: [...updated.tags] });
    },
    deleteKb: (id, kbIdParam) => {
      const list = kb[id] ?? [];
      kb[id] = list.filter((x) => String(x.id) !== kbIdParam);
      return delay(undefined);
    },

    listCalls: (id, opts) => {
      const list = [...(calls[id] ?? [])].sort((a, b) =>
        b.startedAt.localeCompare(a.startedAt),
      );
      const offset = opts?.offset ?? 0;
      const limit = opts?.limit ?? list.length;
      return delay(
        list.slice(offset, offset + limit).map((c) => ({
          id: c.id,
          from: c.from,
          to: c.to,
          direction: c.direction,
          intent: c.intent,
          outcome: c.outcome,
          startedAt: c.startedAt,
          durationSec: c.durationSec,
        })),
      );
    },
    getCall: (id, callIdParam) => {
      const found = (calls[id] ?? []).find((c) => String(c.id) === callIdParam);
      if (!found)
        return Promise.reject(new ApiError("not_found", `통화 기록을 찾을 수 없어요: ${callIdParam}`));
      return delay({
        ...found,
        transcript: found.transcript.map((s) => ({ ...s })),
        toolInvocations: [...found.toolInvocations],
      });
    },
  };
}

// ── Fetch 구현 (실제 백엔드 통합) ───────────────────────────────
// apps/api 는 모든 라우트를 {ok:true,data}|{ok:false,error} 봉투(ToolInvocationResult
// 와 동일 컨벤션)로 응답한다. 콘솔 클라이언트는 여기서 그 봉투를 벗겨 순수 데이터만
// ConsoleApi 인터페이스로 흘려보낸다. 실패 봉투의 error.code 는 ApiError 로 보존한다.
interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
    ...init,
  });
  if (res.status === 204) return undefined as T;

  let body: ApiEnvelope<T> | T | null = null;
  try {
    body = (await res.json()) as ApiEnvelope<T> | T;
  } catch {
    body = null;
  }
  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.ok) {
      throw new ApiError(
        envelope.error?.code ?? "internal_error",
        envelope.error?.message ?? "알 수 없는 오류가 발생했어요.",
      );
    }
    return envelope.data as T;
  }
  if (!res.ok) {
    throw new ApiError(
      "internal_error",
      `API ${init?.method ?? "GET"} ${path} → ${res.status}`,
    );
  }
  return body as T;
}

function makeFetchApi(): ConsoleApi {
  const base = (id: string) => `/tenants/${encodeURIComponent(id)}`;
  return {
    login: (req) => http("/auth/login", { method: "POST", body: JSON.stringify(req) }),

    kakaoLogin: (req) =>
      http("/auth/kakao/callback", { method: "POST", body: JSON.stringify(req) }),

    signup: (req) => http("/signup", { method: "POST", body: JSON.stringify(req) }),

    getTenant: (id) => http(base(id)),
    updateTenant: (id, patch) =>
      http(base(id), { method: "PUT", body: JSON.stringify(patch) }),

    getAgentConfig: (id) => http(`${base(id)}/agent-config`),
    updateAgentConfig: (id, draft) =>
      http(`${base(id)}/agent-config`, { method: "PUT", body: JSON.stringify(draft) }),

    listIntents: (id) => http(`${base(id)}/intents`),
    createIntent: (id, draft) =>
      http(`${base(id)}/intents`, { method: "POST", body: JSON.stringify(draft) }),
    updateIntent: (id, intentIdParam, draft) =>
      http(`${base(id)}/intents/${encodeURIComponent(intentIdParam)}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      }),
    deleteIntent: (id, intentIdParam) =>
      http(`${base(id)}/intents/${encodeURIComponent(intentIdParam)}`, {
        method: "DELETE",
      }),

    listTools: (id) => http(`${base(id)}/tools`),
    createTool: (id, draft) =>
      http(`${base(id)}/tools`, { method: "POST", body: JSON.stringify(draft) }),
    updateTool: (id, toolIdParam, draft) =>
      http(`${base(id)}/tools/${encodeURIComponent(toolIdParam)}`, {
        method: "PUT",
        body: JSON.stringify(draft),
      }),
    deleteTool: (id, toolIdParam) =>
      http(`${base(id)}/tools/${encodeURIComponent(toolIdParam)}`, {
        method: "DELETE",
      }),

    applyIndustryTemplate: (id, industryKeyOverride) =>
      http(`${base(id)}/industry-template`, {
        method: "POST",
        body: JSON.stringify({ industryKey: industryKeyOverride ?? null }),
      }),

    listKb: (id) => http(`${base(id)}/kb`),
    createKb: (id, draft) =>
      http(`${base(id)}/kb`, { method: "POST", body: JSON.stringify(draft) }),
    updateKb: (id, kbIdParam, patch) =>
      http(`${base(id)}/kb/${encodeURIComponent(kbIdParam)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    deleteKb: (id, kbIdParam) =>
      http(`${base(id)}/kb/${encodeURIComponent(kbIdParam)}`, { method: "DELETE" }),

    listCalls: (id, opts) => {
      const params = new URLSearchParams();
      if (opts?.limit != null) params.set("limit", String(opts.limit));
      if (opts?.offset != null) params.set("offset", String(opts.offset));
      const qs = params.toString();
      return http(`${base(id)}/calls${qs ? `?${qs}` : ""}`);
    },
    getCall: (id, callIdParam) =>
      http(`${base(id)}/calls/${encodeURIComponent(callIdParam)}`),
  };
}

export const api: ConsoleApi = IS_FIXTURE ? makeFixtureApi() : makeFetchApi();
export type { TenantIntentId, TenantToolId };
