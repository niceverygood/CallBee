/**
 * 총괄관리자(platform_admin) 화면 전용 API — 콘솔로 통합된 관리자 기능.
 *
 * 별도 관리자 앱(apps/admin) 없이, 콘솔 /login 에서 platform_admin 계정으로
 * 로그인하면 /admin 라우트(AdminTenantsPage)가 이 모듈을 소비한다.
 * 인증/봉투 처리(client.ts 의 http)와 데이터소스 토글(IS_FIXTURE)을 그대로
 * 재사용한다 — fetch 모드는 apps/api 의 /admin/tenants* 를 호출하고,
 * 데모(fixture) 모드는 콘솔 fixture 테넌트 목록으로 심사 플로우를 재현한다.
 */
import type {
  ApproveTenantRequest,
  CreateTenantAccountRequest,
  CreateTenantAccountResult,
  RejectTenantRequest,
  TenantReviewResult,
  TenantSummary,
} from "@colli/contracts";
import { findIndustryTemplatePack, makePendingPhoneNumber } from "@colli/contracts";
import { ApiError, IS_FIXTURE, http } from "./client";
import { TENANTS } from "./fixtures";

/**
 * 관리자 목록 행 — TenantSummary + 승인 큐 표시용 소유자 이메일(있으면 표시).
 * ownerEmail 은 계약 밖 표시 전용 필드라 optional 로만 다룬다(없으면 "-").
 */
export type TenantAdminListItem = TenantSummary & { ownerEmail?: string | null };

export interface AdminApi {
  listTenants(): Promise<TenantAdminListItem[]>;
  /** POST /admin/tenants/:id/approve — 070 배정 + status=active (+업종 팩 자동 적용) */
  approveTenant(tenantId: string, req: ApproveTenantRequest): Promise<TenantReviewResult>;
  /** POST /admin/tenants/:id/reject — 사유 기록 + status=rejected */
  rejectTenant(tenantId: string, req: RejectTenantRequest): Promise<TenantReviewResult>;
  createTenantAccount(req: CreateTenantAccountRequest): Promise<CreateTenantAccountResult>;
}

// ── Fixture 구현 (데모) ─────────────────────────────────────────
/** 테스트 격리용 — fixture 상태를 초기값으로 되돌린다(fetch 모드에선 no-op). */
export let resetAdminFixture: () => void = () => {};

function makeFixtureAdminApi(): AdminApi {
  // 콘솔 fixture 테넌트(BoBi 운영 중 + 달콤한 파스타 승인 대기)를 복제해
  // 심사 플로우(승인/반려/생성)를 인메모리로 재현한다. 새로고침 시 초기화.
  let tenants: TenantAdminListItem[] = TENANTS.map((t) => ({ ...t }));
  let seq = 1;
  resetAdminFixture = () => {
    tenants = TENANTS.map((t) => ({ ...t }));
    seq = 1;
  };

  const delay = <T,>(v: T): Promise<T> => new Promise((r) => setTimeout(() => r(v), 120));

  const find = (id: string) => {
    const t = tenants.find((x) => String(x.tenantId) === id);
    if (!t) throw new ApiError("tenant_not_found", `사업장을 찾을 수 없어요: ${id}`);
    return t;
  };

  return {
    listTenants: () => delay(tenants.map((t) => ({ ...t }))),

    approveTenant: (tenantId, req) => {
      const t = find(tenantId);
      const taken = tenants.some(
        (x) => String(x.tenantId) !== tenantId && x.phoneNumber === req.phoneNumber,
      );
      if (taken) {
        return Promise.reject(
          new ApiError("phone_number_taken", "이미 다른 사업장에 배정된 번호예요."),
        );
      }
      t.status = "active";
      t.phoneNumber = req.phoneNumber;
      t.approvedAt = new Date().toISOString();
      // 실서버(auth.controller.ts)의 승인 시 업종 팩 자동 적용 요약을 데모로 재현.
      const pack = findIndustryTemplatePack(t.industryKey ?? null);
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
      return delay({ tenant: { ...t }, industryTemplate });
    },

    rejectTenant: (tenantId, req) => {
      const t = find(tenantId);
      t.status = "rejected";
      t.rejectionReason = req.reason;
      t.rejectedAt = new Date().toISOString();
      return delay({ tenant: { ...t } });
    },

    createTenantAccount: (req) => {
      const slug = `${req.companyName.trim().toLowerCase().replace(/\s+/g, "-") || "tenant"}-${seq}`;
      const tenant: TenantAdminListItem = {
        tenantId: `tenant_admin_demo_${seq++}` as TenantSummary["tenantId"],
        slug,
        name: req.companyName,
        industryLabel: req.industryLabel ?? null,
        phoneNumber: req.phoneNumber || makePendingPhoneNumber(slug),
        status: "active",
        plan: "trial",
        ownerEmail: req.adminEmail,
      };
      tenants.push(tenant);
      return delay({
        tenantId: tenant.tenantId,
        account: {
          accountId: `acct_admin_demo_${seq}` as never,
          email: req.adminEmail,
          role: "tenant_admin" as const,
          tenantId: tenant.tenantId,
          createdAt: new Date().toISOString(),
        },
      });
    },
  };
}

// ── Fetch 구현 (실제 백엔드) ────────────────────────────────────
function makeFetchAdminApi(): AdminApi {
  return {
    listTenants: () => http("/admin/tenants"),
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
    createTenantAccount: (req) =>
      http("/admin/tenants", { method: "POST", body: JSON.stringify(req) }),
  };
}

export const adminApi: AdminApi = IS_FIXTURE ? makeFixtureAdminApi() : makeFetchAdminApi();
