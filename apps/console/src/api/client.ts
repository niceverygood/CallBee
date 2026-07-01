/**
 * API 클라이언트 레이어 — fixture(목) 소스와 실제 fetch 소스를 토글.
 * apps/admin 의 src/api/client.ts 와 동일한 패턴(토글 규칙 동일).
 *
 * 토글 규칙:
 *   - import.meta.env.VITE_DATA_SOURCE === "fetch"  → 실제 백엔드(apps/api) 호출
 *   - 그 외(기본, dev 포함)                          → fixtures.ts 의 목 데이터
 *   - 베이스 URL: import.meta.env.VITE_API_BASE_URL (기본 "/api")
 *
 * 모든 엔드포인트는 tenantId 로 스코프된다(멀티테넌트 격리, 1차 방어선은
 * apps/api 몫이지만 콘솔은 항상 tenantId 를 경로에 포함해 호출한다).
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
  OnboardingDraft,
  OnboardingResult,
} from "./types";
import type { TenantIntentId, TenantToolId } from "@colli/contracts";
import {
  TENANTS,
  AGENT_CONFIGS,
  INTENTS_BY_TENANT,
  TOOLS_BY_TENANT,
  KB_BY_TENANT,
  BOBI_TENANT_ID,
} from "./fixtures";

export interface ConsoleApi {
  submitOnboarding(draft: OnboardingDraft): Promise<OnboardingResult>;

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

  listKb(tenantId: string): Promise<KnowledgeItem[]>;
  createKb(tenantId: string, draft: KnowledgeItemDraft): Promise<KnowledgeItem>;
  updateKb(
    tenantId: string,
    kbId: string,
    patch: Partial<KnowledgeItemDraft>,
  ): Promise<KnowledgeItem>;
  deleteKb(tenantId: string, kbId: string): Promise<void>;
}

// ── 환경 토글 ───────────────────────────────────────────────────
const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE as string | undefined) ?? "fixture";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const IS_FIXTURE = DATA_SOURCE !== "fetch";

/**
 * 콘솔이 다루는 "현재 로그인한 테넌트" 식별자(실제 인증 붙기 전까지 고정).
 * fixture 모드는 fixtures.ts 의 목 ID, fetch 모드는 실제 DB의 cuid 가 필요하므로
 * VITE_DEFAULT_TENANT_ID 로 오버라이드 가능하게 한다(실 인증 붙으면 이 상수는 제거).
 */
export const DEFAULT_TENANT_ID: string =
  (import.meta.env.VITE_DEFAULT_TENANT_ID as string | undefined) ??
  (BOBI_TENANT_ID as unknown as string);

// ── Fixture 구현 (dev 기본) ─────────────────────────────────────
function makeFixtureApi(): ConsoleApi {
  const tenants = TENANTS.map((t) => ({ ...t }));
  const agentConfigs: Record<string, TenantAgentConfig> = Object.fromEntries(
    Object.entries(AGENT_CONFIGS).map(([k, v]) => [
      k,
      { ...v, toneExtra: [...v.toneExtra], domainConstraints: [...v.domainConstraints] },
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

  let intentSeq = 1000;
  let toolSeq = 1000;
  let kbSeq = 1000;

  const delay = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), 120));

  const findTenant = (id: string) => {
    const t = tenants.find((x) => String(x.tenantId) === id);
    if (!t) throw new Error(`tenant not found: ${id}`);
    return t;
  };

  return {
    submitOnboarding: (draft) => {
      const newTenant: TenantSummary = {
        tenantId: `tenant_${Date.now()}` as unknown as TenantSummary["tenantId"],
        slug: draft.companyName.trim().toLowerCase().replace(/\s+/g, "-") || "new-tenant",
        name: draft.companyName,
        industryLabel: draft.industryLabel || null,
        phoneNumber: draft.requestedPhoneNumber,
        status: "onboarding",
        plan: "trial",
      };
      tenants.push(newTenant);
      agentConfigs[String(newTenant.tenantId)] = {
        tenantId: newTenant.tenantId,
        serviceName: draft.companyName,
        agentName: "상담원",
        greetingText: null,
        personaInstructions: null,
        toneExtra: [],
        domainConstraints: [],
        intentUnresolvedFallbackTool: "request_callback",
        maxIntentAttempts: 2,
      };
      intents[String(newTenant.tenantId)] = [];
      tools[String(newTenant.tenantId)] = [];
      kb[String(newTenant.tenantId)] = [];
      return delay({
        tenant: { ...newTenant },
        message: `${draft.companyName} 온보딩 신청이 접수되었습니다. 070 번호는 검토 후 배정됩니다(목 데이터).`,
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
      if (!cfg) return Promise.reject(new Error(`agent config not found: ${id}`));
      return delay({ ...cfg, toneExtra: [...cfg.toneExtra], domainConstraints: [...cfg.domainConstraints] });
    },
    updateAgentConfig: (id, draft) => {
      const next: TenantAgentConfig = {
        tenantId: id as unknown as TenantAgentConfig["tenantId"],
        ...draft,
        toneExtra: [...draft.toneExtra],
        domainConstraints: [...draft.domainConstraints],
      };
      agentConfigs[id] = next;
      return delay({ ...next, toneExtra: [...next.toneExtra], domainConstraints: [...next.domainConstraints] });
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
      intentSeq += 1;
      return delay({ ...item, keywords: [...item.keywords] });
    },
    updateIntent: (id, intentIdParam, draft) => {
      const list = intents[id] ?? [];
      const idx = list.findIndex((x) => String(x.key) === intentIdParam);
      if (idx === -1) return Promise.reject(new Error(`intent not found: ${intentIdParam}`));
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
      if (idx === -1) return Promise.reject(new Error(`tool not found: ${toolIdParam}`));
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
      if (idx === -1) return Promise.reject(new Error(`kb not found: ${kbIdParam}`));
      const updated = { ...list[idx]!, ...patch, updatedAt: new Date().toISOString() };
      list[idx] = updated;
      return delay({ ...updated, tags: [...updated.tags] });
    },
    deleteKb: (id, kbIdParam) => {
      const list = kb[id] ?? [];
      kb[id] = list.filter((x) => String(x.id) !== kbIdParam);
      return delay(undefined);
    },
  };
}

// ── Fetch 구현 (실제 백엔드 통합) ───────────────────────────────
// apps/api 는 모든 라우트를 {ok:true,data}|{ok:false,error} 봉투(ToolInvocationResult
// 와 동일 컨벤션)로 응답한다. 콘솔 클라이언트는 여기서 그 봉투를 벗겨 순수 데이터만
// ConsoleApi 인터페이스로 흘려보낸다.
interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
    ...init,
  });
  if (!res.ok) {
    throw new Error(`API ${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.ok) {
      throw new Error(
        `API ${init?.method ?? "GET"} ${path} → ${envelope.error?.code ?? "error"}: ${envelope.error?.message ?? "unknown error"}`,
      );
    }
    return envelope.data as T;
  }
  return body as T;
}

function makeFetchApi(): ConsoleApi {
  const base = (id: string) => `/tenants/${encodeURIComponent(id)}`;
  return {
    submitOnboarding: (draft) =>
      http("/onboarding", { method: "POST", body: JSON.stringify(draft) }),

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
  };
}

export const api: ConsoleApi = IS_FIXTURE ? makeFixtureApi() : makeFetchApi();
export type { TenantIntentId, TenantToolId };
