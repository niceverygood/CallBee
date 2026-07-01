/**
 * 인증 · 테넌트관리 API 레이어 — fixture(목) 소스와 실제 fetch 소스를 토글.
 * apps/admin/src/api/client.ts 와 동일한 토글 패턴(VITE_DATA_SOURCE)을 그대로 쓴다.
 *
 * 토글 규칙:
 *   - import.meta.env.VITE_DATA_SOURCE === "fetch"  → 실제 백엔드(apps/api) 호출
 *   - 그 외(기본, dev 포함)                          → 목 platform_admin 로그인 +
 *     인메모리 테넌트 목록(렌더 테스트/데모용)
 *   - 베이스 URL: import.meta.env.VITE_API_BASE_URL (기본 "/api")
 *
 * apps/api 는 모든 라우트를 {ok:true,data}|{ok:false,error} 봉투로 응답하므로
 * fetch 구현은 반드시 이 봉투를 벗겨 순수 데이터만 반환해야 한다(console 워커가
 * 겪었던 함정과 동일 — apps/console/src/api/client.ts 의 http() 참고).
 */
import type {
  LoginRequest,
  LoginResponse,
  AdminAccountSummary,
  TenantSummary,
  CreateTenantAccountRequest,
  CreateTenantAccountResult,
} from "@colli/contracts";

export interface AuthApi {
  login(req: LoginRequest): Promise<LoginResponse>;
  listTenants(): Promise<TenantSummary[]>;
  createTenantAccount(
    req: CreateTenantAccountRequest,
  ): Promise<CreateTenantAccountResult>;
}

// ── 환경 토글 ───────────────────────────────────────────────────
const DATA_SOURCE = (import.meta.env.VITE_DATA_SOURCE as string | undefined) ?? "fixture";
const API_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";

export const IS_FIXTURE = DATA_SOURCE !== "fetch";

// ── Fixture 구현 (dev 기본) ─────────────────────────────────────
// 아무 이메일/비밀번호나 입력하면 목 platform_admin 계정으로 로그인된다
// (렌더 테스트가 실 백엔드 없이도 계속 동작하게 하기 위함). 단, 이메일에
// "tenant" 문자열이 포함되면 tenant_admin 목 계정을 반환해 apps/admin 의
// 역할 거부 흐름도 fixture 모드에서 확인할 수 있게 한다.
let fixtureTenantSeq = 1;
const fixtureTenants: TenantSummary[] = [
  {
    tenantId: "tenant_bobi" as unknown as TenantSummary["tenantId"],
    slug: "bobi",
    name: "BoBi",
    industryLabel: "보험설계사 SaaS",
    phoneNumber: "+8207011112222",
    status: "active",
    plan: "pro",
  },
];

function makeFixtureApi(): AuthApi {
  const delay = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), 120));

  return {
    login: (req) => {
      const isTenantAdmin = req.email.toLowerCase().includes("tenant");
      const account: AdminAccountSummary = {
        accountId: (isTenantAdmin
          ? "acct_fixture_tenant"
          : "acct_fixture_platform") as unknown as AdminAccountSummary["accountId"],
        email: req.email || "platform-admin@colli.example",
        role: isTenantAdmin ? "tenant_admin" : "platform_admin",
        tenantId: isTenantAdmin
          ? (fixtureTenants[0]!.tenantId as unknown as AdminAccountSummary["tenantId"])
          : null,
        createdAt: new Date().toISOString(),
      };
      return delay({ account, token: "fixture-token" });
    },

    listTenants: () => delay(fixtureTenants.map((t) => ({ ...t }))),

    createTenantAccount: (req) => {
      const tenant: TenantSummary = {
        tenantId: `tenant_fixture_${fixtureTenantSeq}` as unknown as TenantSummary["tenantId"],
        slug: req.companyName.trim().toLowerCase().replace(/\s+/g, "-") || `tenant-${fixtureTenantSeq}`,
        name: req.companyName,
        industryLabel: req.industryLabel || null,
        phoneNumber: req.phoneNumber,
        status: "onboarding",
        plan: "trial",
      };
      fixtureTenantSeq += 1;
      fixtureTenants.push(tenant);
      const account: AdminAccountSummary = {
        accountId: `acct_fixture_${fixtureTenantSeq}` as unknown as AdminAccountSummary["accountId"],
        email: req.adminEmail,
        role: "tenant_admin",
        tenantId: tenant.tenantId,
        createdAt: new Date().toISOString(),
      };
      return delay({ tenantId: tenant.tenantId, account });
    },
  };
}

// ── Fetch 구현 (실제 백엔드 통합) ───────────────────────────────
interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string };
}

const TOKEN_KEY = "colli-admin-token";

function getStoredToken(): string | null {
  if (typeof localStorage === "undefined") return null;
  return localStorage.getItem(TOKEN_KEY);
}

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const token = getStoredToken();
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
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

function makeFetchApi(): AuthApi {
  return {
    login: (req) => http("/auth/login", { method: "POST", body: JSON.stringify(req) }),
    listTenants: () => http("/admin/tenants"),
    createTenantAccount: (req) =>
      http("/admin/tenants", { method: "POST", body: JSON.stringify(req) }),
  };
}

export const authApi: AuthApi = IS_FIXTURE ? makeFixtureApi() : makeFetchApi();
