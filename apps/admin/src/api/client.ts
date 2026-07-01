/**
 * API 클라이언트 레이어 — fixture(목) 소스와 실제 fetch 소스를 토글.
 *
 * 토글 규칙:
 *   - import.meta.env.VITE_DATA_SOURCE === "fetch"  → 실제 백엔드(Worker C) 호출
 *   - 그 외(기본, dev 포함)                          → fixtures.ts 의 목 데이터
 *   - 베이스 URL: import.meta.env.VITE_API_BASE_URL (기본 "/api")
 *
 * 두 구현 모두 동일한 `AdminApi` 인터페이스를 만족한다. UI/훅은 인터페이스만 의존한다.
 */
import type {
  CallDetail,
  CallListItem,
  TicketRow,
  TicketUpdate,
  CallbackRow,
  KnowledgeItem,
  KnowledgeItemDraft,
  DashboardMetrics,
} from "./types";
import {
  CALL_LIST,
  CALL_DETAILS,
  TICKETS,
  CALLBACKS,
  KB_ITEMS,
  METRICS,
} from "./fixtures";

export interface AdminApi {
  getMetrics(): Promise<DashboardMetrics>;
  listCalls(): Promise<CallListItem[]>;
  getCall(id: string): Promise<CallDetail>;
  listTickets(): Promise<TicketRow[]>;
  updateTicket(id: string, patch: TicketUpdate): Promise<TicketRow>;
  listCallbacks(): Promise<CallbackRow[]>;
  listKb(): Promise<KnowledgeItem[]>;
  createKb(draft: KnowledgeItemDraft): Promise<KnowledgeItem>;
  updateKb(id: string, patch: Partial<KnowledgeItemDraft>): Promise<KnowledgeItem>;
  deleteKb(id: string): Promise<void>;
}

// ── 환경 토글 ───────────────────────────────────────────────────
const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE as string | undefined) ?? "fixture";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const IS_FIXTURE = DATA_SOURCE !== "fetch";

// ── Fixture 구현 (dev 기본) ─────────────────────────────────────
// 상태 변경(티켓/ KB)은 in-memory 복제본에 반영해 UI 상호작용이 유지되게 한다.
function makeFixtureApi(): AdminApi {
  const tickets = TICKETS.map((t) => ({ ...t }));
  let kb = KB_ITEMS.map((k) => ({ ...k, tags: [...k.tags] }));
  let kbSeq = kb.length + 1;

  const delay = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), 120));

  return {
    getMetrics: () => delay({ ...METRICS }),
    listCalls: () => delay(CALL_LIST.map((c) => ({ ...c }))),
    getCall: (id) => {
      const found = CALL_DETAILS.find((c) => String(c.id) === id);
      if (!found) return Promise.reject(new Error(`call not found: ${id}`));
      return delay({ ...found });
    },
    listTickets: () => delay(tickets.map((t) => ({ ...t }))),
    updateTicket: (id, patch) => {
      const t = tickets.find((x) => String(x.id) === id);
      if (!t) return Promise.reject(new Error(`ticket not found: ${id}`));
      Object.assign(t, patch, { updatedAt: new Date().toISOString() });
      return delay({ ...t });
    },
    listCallbacks: () => delay(CALLBACKS.map((c) => ({ ...c }))),
    listKb: () => delay(kb.map((k) => ({ ...k, tags: [...k.tags] }))),
    createKb: (draft) => {
      const item: KnowledgeItem = {
        ...draft,
        tags: [...draft.tags],
        id: `kb_new_${kbSeq++}` as unknown as KnowledgeItem["id"],
        updatedAt: new Date().toISOString(),
      };
      kb = [item, ...kb];
      return delay({ ...item, tags: [...item.tags] });
    },
    updateKb: (id, patch) => {
      const k = kb.find((x) => String(x.id) === id);
      if (!k) return Promise.reject(new Error(`kb not found: ${id}`));
      Object.assign(k, patch, { updatedAt: new Date().toISOString() });
      return delay({ ...k, tags: [...k.tags] });
    },
    deleteKb: (id) => {
      kb = kb.filter((x) => String(x.id) !== id);
      return delay(undefined);
    },
  };
}

// ── Fetch 구현 (실제 백엔드 통합) ───────────────────────────────
// apps/api 는 모든 라우트를 {ok:true,data}|{ok:false,error} 봉투(ToolInvocationResult
// 와 동일 컨벤션)로 응답한다. 여기서 그 봉투를 벗겨 순수 데이터만 AdminApi
// 인터페이스로 흘려보낸다(apps/console/src/api/client.ts 의 http() 헬퍼와 동일 패턴).
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

function makeFetchApi(): AdminApi {
  return {
    getMetrics: () => http("/admin/metrics"),
    listCalls: () => http("/admin/calls"),
    getCall: (id) => http(`/admin/calls/${encodeURIComponent(id)}`),
    listTickets: () => http("/admin/tickets"),
    updateTicket: (id, patch) =>
      http(`/admin/tickets/${encodeURIComponent(id)}`, {
        method: "PATCH",
        body: JSON.stringify(patch),
      }),
    listCallbacks: () => http("/admin/callbacks"),
    listKb: () => http("/admin/kb"),
    createKb: (draft) =>
      http("/admin/kb", { method: "POST", body: JSON.stringify(draft) }),
    updateKb: (id, patch) =>
      http(`/admin/kb/${encodeURIComponent(id)}`, {
        method: "PUT",
        body: JSON.stringify(patch),
      }),
    deleteKb: (id) =>
      http(`/admin/kb/${encodeURIComponent(id)}`, { method: "DELETE" }),
  };
}

export const api: AdminApi = IS_FIXTURE ? makeFixtureApi() : makeFetchApi();
