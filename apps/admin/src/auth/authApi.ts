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
  ApproveTenantRequest,
  RejectTenantRequest,
  TenantReviewResult,
} from "@colli/contracts";
import {
  findIndustryTemplatePack,
  isPhoneNumberAssigned,
  makePendingPhoneNumber,
} from "@colli/contracts";

/**
 * 관리자 목록 행 — TenantSummary + 승인 큐 표시용 소유자 이메일(있으면 표시).
 * ownerEmail 은 계약 밖 표시 전용 필드라 optional 로만 다룬다(없으면 "-").
 */
export type TenantAdminListItem = TenantSummary & { ownerEmail?: string | null };

/**
 * 봉투 에러를 code 로 판별할 수 있는 타입드 에러.
 * 승인 모달의 phone_number_taken 인라인 처리 등에 사용한다.
 */
export class ApiError extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function apiErrorCode(err: unknown): string | null {
  return err instanceof ApiError ? err.code : null;
}

export interface AuthApi {
  login(req: LoginRequest): Promise<LoginResponse>;
  listTenants(): Promise<TenantAdminListItem[]>;
  createTenantAccount(
    req: CreateTenantAccountRequest,
  ): Promise<CreateTenantAccountResult>;
  /** POST /admin/tenants/:id/approve — 070 배정 + status=active */
  approveTenant(tenantId: string, req: ApproveTenantRequest): Promise<TenantReviewResult>;
  /** POST /admin/tenants/:id/reject — 사유 기록 + status=rejected */
  rejectTenant(tenantId: string, req: RejectTenantRequest): Promise<TenantReviewResult>;
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
const fixtureTenants: TenantAdminListItem[] = [
  {
    tenantId: "tenant_bobi" as unknown as TenantSummary["tenantId"],
    slug: "bobi",
    name: "BoBi",
    industryLabel: "보험설계사 SaaS",
    phoneNumber: "+8207011112222",
    status: "active",
    plan: "pro",
    ownerEmail: "owner@bobi.example",
  },
  // 승인 대기 목 2건 — 승인 큐 렌더 테스트/데모용. appliedAt 오름차순 정렬 확인을
  // 위해 일부러 "나중 신청" 건을 배열 앞에 둔다.
  {
    tenantId: "tenant_pending_pasta" as unknown as TenantSummary["tenantId"],
    slug: "yoonjung-pasta",
    name: "윤정 파스타",
    industryLabel: "식당·카페",
    industryKey: "restaurant_cafe",
    phoneNumber: makePendingPhoneNumber("yoonjung-pasta"),
    status: "pending_approval",
    plan: "trial",
    contactPhone: "02-1234-5678",
    appliedAt: "2026-06-30T09:15:00+09:00",
    ownerEmail: "yoonjung@pasta.example",
  },
  {
    tenantId: "tenant_pending_clinic" as unknown as TenantSummary["tenantId"],
    slug: "taeho-clinic",
    name: "태호 피부과",
    industryLabel: "병원·의원",
    industryKey: "hospital_clinic",
    phoneNumber: makePendingPhoneNumber("taeho-clinic"),
    status: "pending_approval",
    plan: "pro",
    contactPhone: "02-9876-5432",
    appliedAt: "2026-06-29T14:00:00+09:00",
    ownerEmail: "drpark@clinic.example",
  },
];

function makeFixtureApi(): AuthApi {
  const delay = <T>(v: T): Promise<T> =>
    new Promise((r) => setTimeout(() => r(v), 120));

  const fail = (code: string, message: string): Promise<never> =>
    new Promise((_, reject) => setTimeout(() => reject(new ApiError(code, message)), 120));

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
      const tenant: TenantAdminListItem = {
        tenantId: `tenant_fixture_${fixtureTenantSeq}` as unknown as TenantSummary["tenantId"],
        slug: req.companyName.trim().toLowerCase().replace(/\s+/g, "-") || `tenant-${fixtureTenantSeq}`,
        name: req.companyName,
        industryLabel: req.industryLabel || null,
        phoneNumber: req.phoneNumber,
        status: "onboarding",
        plan: "trial",
        ownerEmail: req.adminEmail,
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

    approveTenant: (tenantId, req) => {
      const tenant = fixtureTenants.find((t) => String(t.tenantId) === tenantId);
      if (!tenant) return fail("tenant_not_found", `no tenant: ${tenantId}`);
      const taken = fixtureTenants.some(
        (t) =>
          String(t.tenantId) !== tenantId &&
          isPhoneNumberAssigned(t.phoneNumber) &&
          t.phoneNumber === req.phoneNumber,
      );
      if (taken) {
        return fail("phone_number_taken", `phone number already assigned: ${req.phoneNumber}`);
      }
      tenant.status = "active";
      tenant.phoneNumber = req.phoneNumber;
      tenant.approvedAt = new Date().toISOString();
      // 실서버(auth.controller.ts)의 승인 시 업종 팩 자동 적용을 데모로 재현 —
      // fixture 에는 의도/KB 저장소가 없으므로 "빈 테넌트에 첫 적용" 요약을 만든다.
      const pack = findIndustryTemplatePack(tenant.industryKey ?? null);
      const industryTemplate = pack
        ? {
            industryKey: pack.industryKey,
            packTitle: pack.title,
            agentConfigCreated: false,
            agentConfigUpdated: true,
            createdIntentKeys: pack.intents.map((i) => i.key),
            skippedIntentKeys: [],
            createdKbQuestionsNeedingAnswer: pack.kbItems
              .filter((k) => !k.enabledOnApply)
              .map((k) => k.question),
            createdKbQuestionsEnabled: pack.kbItems
              .filter((k) => k.enabledOnApply)
              .map((k) => k.question),
            skippedKbQuestions: [],
          }
        : null;
      return delay({ tenant: { ...tenant }, industryTemplate });
    },

    rejectTenant: (tenantId, req) => {
      const tenant = fixtureTenants.find((t) => String(t.tenantId) === tenantId);
      if (!tenant) return fail("tenant_not_found", `no tenant: ${tenantId}`);
      tenant.status = "rejected";
      tenant.rejectionReason = req.reason;
      tenant.rejectedAt = new Date().toISOString();
      return delay({ tenant: { ...tenant } });
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
    // 봉투에 에러 코드가 담겨 왔으면 코드 보존(4xx 에도 봉투로 응답하는 라우트 대비)
    const body = (await res.json().catch(() => null)) as ApiEnvelope<T> | null;
    if (body && typeof body === "object" && "ok" in body && !body.ok && body.error) {
      throw new ApiError(body.error.code, body.error.message);
    }
    throw new Error(`API ${init?.method ?? "GET"} ${path} → ${res.status}`);
  }
  if (res.status === 204) return undefined as T;
  const body = (await res.json()) as ApiEnvelope<T> | T;
  if (body && typeof body === "object" && "ok" in body) {
    const envelope = body as ApiEnvelope<T>;
    if (!envelope.ok) {
      throw new ApiError(
        envelope.error?.code ?? "unknown_error",
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
    approveTenant: (tenantId, req) =>
      http(`/admin/tenants/${encodeURIComponent(tenantId)}/approve`, {
        method: "POST",
        body: JSON.stringify(req),
      }),
    rejectTenant: (tenantId, req) =>
      http(`/admin/tenants/${encodeURIComponent(tenantId)}/reject`, {
        method: "POST",
        body: JSON.stringify(req),
      }),
  };
}

export const authApi: AuthApi = IS_FIXTURE ? makeFixtureApi() : makeFetchApi();
