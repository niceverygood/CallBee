/**
 * 얇은 NestJS 컨트롤러: 관리자 계정 로그인 + platform_admin 전용 테넌트/계정
 * 발급. apps/admin("콜비 총괄관리자")과 apps/console("에이전트 스튜디오")이
 * 소비하는 로그인 경로.
 *
 * - POST /auth/login: 인증 불필요. email/password 검증 후 세션 토큰 발급.
 * - GET /admin/tenants: platform_admin 전용 — 전체 Tenant 목록.
 * - POST /admin/tenants: platform_admin 전용 — 신규 Tenant + 기본
 *   TenantAgentConfig + 그 테넌트의 첫 tenant_admin AdminAccount 를 하나의
 *   트랜잭션으로 생성한다(onboarding.controller.ts 의 기본 에이전트 설정 값
 *   패턴을 그대로 따른다: agentName="상담원" 등).
 *
 * 실제 인증 판정(role 체크)은 AuthGuard(auth.guard.ts)가 라우트 데코레이터
 * (@RequireRole)로 수행한다 — 이 컨트롤러는 HTTP 파라미터 파싱 + 응답 shape
 * 조립만 담당한다.
 */
import { Body, Controller, Get, Inject, Param, Post, Query, UseGuards } from "@nestjs/common";
import {
  TENANT_STATUSES,
  type AdminAccountSummary,
  type ApproveTenantRequest,
  type CreateTenantAccountRequest,
  type CreateTenantAccountResult,
  type KakaoLoginCallbackRequest,
  type LoginRequest,
  type LoginResponse,
  type RejectTenantRequest,
  type TenantId,
  type TenantReviewResult,
  type TenantStatus,
  type TenantSummary,
} from "@colli/contracts";
import { findIndustryTemplatePack } from "@colli/contracts";
import { prisma } from "@colli/db";
import { isValidPhoneNumberFormat } from "./signup.controller.js";
import type { TenantRepository, TenantAgentConfigRepository } from "./tenant.ports.js";
import type { AdminAccountRepository, AdminAccountRecord } from "./auth/auth.repository.js";
import { IndustryTemplateService } from "./industry-template.service.js";
import { TENANT_REPO, TENANT_AGENT_CONFIG_REPO, ADMIN_ACCOUNT_REPO } from "./tokens.js";
import { hashPassword, verifyPassword } from "./auth/password.js";
import { signToken } from "./auth/token.js";
import { AuthGuard, RequireRole } from "./auth/auth.guard.js";
import { WebhookValidationError } from "./webhook-validation.js";
import type { ApiResult } from "./tenants.controller.js";

function errResult(err: unknown): ApiResult<never> {
  if (err instanceof WebhookValidationError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { ok: false, error: { code: "internal_error", message } };
}

function toAccountSummary(rec: AdminAccountRecord): AdminAccountSummary {
  return {
    accountId: rec.accountId,
    email: rec.email,
    role: rec.role,
    tenantId: rec.tenantId,
    createdAt: rec.createdAt,
  };
}

const KAKAO_TOKEN_URL = "https://kauth.kakao.com/oauth/token";
const KAKAO_USER_ME_URL = "https://kapi.kakao.com/v2/user/me";
const DEFAULT_KAKAO_REDIRECT_URI = "http://localhost:5175/auth/kakao/callback";

interface KakaoTokenResponse {
  access_token?: string;
  error?: string;
  error_description?: string;
}

interface KakaoUserMeResponse {
  id?: number;
  kakao_account?: {
    email?: string;
  };
  msg?: string;
}

function kakaoRestApiKey(): string | null {
  return (process.env.KAKAO_REST_API_KEY ?? process.env.KAKAO_CLIENT_ID ?? "").trim() || null;
}

function kakaoClientSecret(): string | null {
  return (process.env.KAKAO_CLIENT_SECRET ?? "").trim() || null;
}

function allowedKakaoRedirectUris(): string[] {
  const configured = (process.env.KAKAO_REDIRECT_URIS ?? process.env.KAKAO_REDIRECT_URI ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);
  if (configured.length > 0) return configured;

  const consoleBase = (process.env.CONSOLE_BASE_URL ?? "").trim().replace(/\/$/, "");
  return consoleBase
    ? [`${consoleBase}/auth/kakao/callback`]
    : [DEFAULT_KAKAO_REDIRECT_URI];
}

function assertAllowedKakaoRedirectUri(redirectUri: string): void {
  if (!allowedKakaoRedirectUris().includes(redirectUri)) {
    throw new WebhookValidationError(
      "invalid_params",
      "등록되지 않은 Kakao redirectUri 입니다",
    );
  }
}

async function parseKakaoJson<T>(res: Response): Promise<T | null> {
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

async function exchangeKakaoCodeForAccessToken(input: {
  code: string;
  redirectUri: string;
}): Promise<string> {
  const clientId = kakaoRestApiKey();
  if (!clientId) {
    throw new WebhookValidationError(
      "kakao_not_configured",
      "KAKAO_REST_API_KEY 환경변수가 필요합니다",
    );
  }

  const form = new URLSearchParams({
    grant_type: "authorization_code",
    client_id: clientId,
    redirect_uri: input.redirectUri,
    code: input.code,
  });
  const secret = kakaoClientSecret();
  if (secret) form.set("client_secret", secret);

  const res = await fetch(KAKAO_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: form.toString(),
  });
  const body = await parseKakaoJson<KakaoTokenResponse>(res);
  if (!res.ok || !body?.access_token) {
    throw new WebhookValidationError(
      "kakao_token_failed",
      body?.error_description ?? body?.error ?? "카카오 토큰 교환에 실패했습니다",
    );
  }
  return body.access_token;
}

async function fetchKakaoAccountEmail(accessToken: string): Promise<string> {
  const res = await fetch(KAKAO_USER_ME_URL, {
    headers: {
      authorization: `Bearer ${accessToken}`,
      "content-type": "application/x-www-form-urlencoded;charset=utf-8",
    },
  });
  const body = await parseKakaoJson<KakaoUserMeResponse>(res);
  if (!res.ok) {
    throw new WebhookValidationError(
      "kakao_userinfo_failed",
      body?.msg ?? "카카오 사용자 정보 조회에 실패했습니다",
    );
  }

  const email = body?.kakao_account?.email?.trim().toLowerCase();
  if (!email) {
    throw new WebhookValidationError(
      "kakao_email_required",
      "카카오 계정 이메일 제공 동의가 필요합니다",
    );
  }
  return email;
}

@Controller()
export class AuthController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(TENANT_AGENT_CONFIG_REPO)
    private readonly agentConfigs: TenantAgentConfigRepository,
    @Inject(ADMIN_ACCOUNT_REPO) private readonly accounts: AdminAccountRepository,
    // tsx 는 emitDecoratorMetadata 미지원 — 명시적 @Inject(tenants.controller.ts 와 동일 사유).
    @Inject(IndustryTemplateService)
    private readonly industryTemplates: IndustryTemplateService,
  ) {}

  // ── 로그인(인증 불필요) ──────────────────────────────────────
  @Post("auth/login")
  async login(@Body() body: LoginRequest): Promise<ApiResult<LoginResponse>> {
    try {
      if (!body.email?.trim() || !body.password) {
        return {
          ok: false,
          error: { code: "invalid_credentials", message: "email, password are required" },
        };
      }
      const account = await this.accounts.findByEmail(body.email);
      if (!account || !verifyPassword(body.password, account.passwordHash)) {
        return {
          ok: false,
          error: { code: "invalid_credentials", message: "email 또는 password 가 올바르지 않습니다" },
        };
      }
      const summary = toAccountSummary(account);
      const token = signToken({
        accountId: summary.accountId,
        role: summary.role,
        tenantId: summary.tenantId,
      });
      return { ok: true, data: { account: summary, token } };
    } catch (err) {
      return errResult(err);
    }
  }

  @Post("auth/kakao/callback")
  async kakaoLogin(
    @Body() body: KakaoLoginCallbackRequest,
  ): Promise<ApiResult<LoginResponse>> {
    try {
      const code = (body.code ?? "").trim();
      const redirectUri = (body.redirectUri ?? "").trim();
      if (!code || !redirectUri) {
        return {
          ok: false,
          error: { code: "invalid_params", message: "code, redirectUri are required" },
        };
      }
      assertAllowedKakaoRedirectUri(redirectUri);

      const accessToken = await exchangeKakaoCodeForAccessToken({ code, redirectUri });
      const email = await fetchKakaoAccountEmail(accessToken);
      const account = await this.accounts.findByEmail(email);
      if (!account) {
        throw new WebhookValidationError(
          "kakao_account_not_found",
          "카카오 계정 이메일과 일치하는 콜비 계정을 찾을 수 없습니다",
        );
      }

      const summary = toAccountSummary(account);
      const token = signToken({
        accountId: summary.accountId,
        role: summary.role,
        tenantId: summary.tenantId,
      });
      return { ok: true, data: { account: summary, token } };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── platform_admin 전용: 전체 테넌트 목록(?status= 필터 지원) ──
  @UseGuards(AuthGuard)
  @RequireRole("platform_admin")
  @Get("admin/tenants")
  async listTenants(
    @Query("status") status?: string,
  ): Promise<ApiResult<TenantSummary[]>> {
    try {
      if (status !== undefined && !TENANT_STATUSES.includes(status as TenantStatus)) {
        throw new WebhookValidationError(
          "invalid_params",
          `status 는 TENANT_STATUSES 중 하나여야 합니다: ${status}`,
        );
      }
      const list = await this.tenants.list();
      const filtered = status ? list.filter((t) => t.status === status) : list;
      // 승인 큐(신청 대기)는 오래된 신청 먼저 처리한다(product-spec §3.2).
      if (status === "pending_approval") {
        filtered.sort((a, b) => (a.appliedAt ?? "").localeCompare(b.appliedAt ?? ""));
      }
      return { ok: true, data: filtered };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── platform_admin 전용: 셀프 가입 신청 승인(070 번호 배정) ────
  @UseGuards(AuthGuard)
  @RequireRole("platform_admin")
  @Post("admin/tenants/:id/approve")
  async approveTenant(
    @Param("id") id: string,
    @Body() body: ApproveTenantRequest,
  ): Promise<ApiResult<TenantReviewResult>> {
    try {
      const phoneNumber = (body.phoneNumber ?? "").trim();
      if (!isValidPhoneNumberFormat(phoneNumber)) {
        throw new WebhookValidationError(
          "invalid_params",
          "phoneNumber 는 숫자/하이픈만, 숫자 9~13자리여야 합니다",
        );
      }

      const tenant = await this.tenants.findById(id as TenantId);
      if (!tenant) {
        return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
      }
      if (tenant.status !== "pending_approval") {
        throw new WebhookValidationError(
          "invalid_state",
          `승인 대기(pending_approval) 상태에서만 승인할 수 있습니다 (현재: ${tenant.status})`,
        );
      }

      // unique 충돌 사전 확인(인메모리/Prisma 공통 1차 방어) — 레이스는 아래
      // P2002 catch 가 2차 방어선.
      const holder = await this.tenants.findByPhoneNumber(phoneNumber);
      if (holder && holder.tenantId !== tenant.tenantId) {
        throw new WebhookValidationError(
          "phone_number_taken",
          "이미 다른 사업장에 배정된 번호예요.",
        );
      }

      const updated = await this.tenants.update(tenant.tenantId, {
        status: "active",
        phoneNumber,
        approvedAt: new Date().toISOString(),
      });
      if (!updated) {
        return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
      }

      // ── 업종 팩 자동 적용(v0.6.0) — 사장님이 스튜디오를 열기 전에 시작
      // 설정(문의 유형/응대 수칙/예시 KB)이 깔려 있게 한다. 비파괴 merge 라
      // 이미 설정한 항목은 건드리지 않고, 재승인·수동 적용과도 멱등이다.
      // 실패해도 승인 자체는 성공시킨다(수동 적용 경로가 콘솔에 있으므로) —
      // 사유만 industryTemplateError 로 관리자에게 알린다.
      const result: TenantReviewResult = { tenant: updated };
      if (findIndustryTemplatePack(updated.industryKey ?? null)) {
        try {
          result.industryTemplate = await this.industryTemplates.apply(
            updated.tenantId,
            null,
          );
        } catch (applyErr) {
          result.industryTemplateError =
            applyErr instanceof Error ? applyErr.message : "업종 팩 자동 적용 실패";
        }
      } else {
        result.industryTemplate = null;
      }
      return { ok: true, data: result };
    } catch (err) {
      // Prisma unique 제약(P2002, Tenant.phoneNumber) → phone_number_taken.
      if ((err as { code?: string }).code === "P2002") {
        return {
          ok: false,
          error: { code: "phone_number_taken", message: "이미 다른 사업장에 배정된 번호예요." },
        };
      }
      return errResult(err);
    }
  }

  // ── platform_admin 전용: 셀프 가입 신청 반려(사유 필수) ────────
  @UseGuards(AuthGuard)
  @RequireRole("platform_admin")
  @Post("admin/tenants/:id/reject")
  async rejectTenant(
    @Param("id") id: string,
    @Body() body: RejectTenantRequest,
  ): Promise<ApiResult<TenantReviewResult>> {
    try {
      const reason = (body.reason ?? "").trim();
      if (reason.length < 1 || reason.length > 500) {
        throw new WebhookValidationError(
          "invalid_params",
          "reason 은 1~500자 필수입니다(신청자에게 그대로 보여집니다)",
        );
      }

      const tenant = await this.tenants.findById(id as TenantId);
      if (!tenant) {
        return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
      }
      if (tenant.status !== "pending_approval") {
        throw new WebhookValidationError(
          "invalid_state",
          `승인 대기(pending_approval) 상태에서만 반려할 수 있습니다 (현재: ${tenant.status})`,
        );
      }

      const updated = await this.tenants.update(tenant.tenantId, {
        status: "rejected",
        rejectionReason: reason,
        rejectedAt: new Date().toISOString(),
      });
      if (!updated) {
        return { ok: false, error: { code: "tenant_not_found", message: `no tenant: ${id}` } };
      }
      return { ok: true, data: { tenant: updated } };
    } catch (err) {
      return errResult(err);
    }
  }

  // ── platform_admin 전용: 신규 테넌트 + 첫 tenant_admin 계정 생성 ──
  @UseGuards(AuthGuard)
  @RequireRole("platform_admin")
  @Post("admin/tenants")
  async createTenantAccount(
    @Body() body: CreateTenantAccountRequest,
  ): Promise<ApiResult<CreateTenantAccountResult>> {
    try {
      if (
        !body.companyName?.trim() ||
        !body.phoneNumber?.trim() ||
        !body.adminEmail?.trim() ||
        !body.adminPassword
      ) {
        throw new WebhookValidationError(
          "invalid_params",
          "companyName, phoneNumber, adminEmail, adminPassword are required",
        );
      }

      const existingAccount = await this.accounts.findByEmail(body.adminEmail);
      if (existingAccount) {
        throw new WebhookValidationError(
          "email_already_exists",
          `admin account email already exists: ${body.adminEmail}`,
        );
      }

      const passwordHash = hashPassword(body.adminPassword);
      const slug = slugify(body.companyName);

      const result = await this.runInTransaction(async () => {
        const tenant = await this.tenants.create({
          slug,
          name: body.companyName,
          industryLabel: body.industryLabel ?? null,
          phoneNumber: body.phoneNumber,
          status: "active",
          plan: "trial",
        });

        await this.agentConfigs.upsert(tenant.tenantId, {
          serviceName: body.companyName,
          agentName: "상담원",
          greetingText: null,
          personaInstructions: null,
          toneExtra: [],
          domainConstraints: [],
          intentUnresolvedFallbackTool: "request_callback",
          maxIntentAttempts: 2,
        });

        const account = await this.accounts.create({
          email: body.adminEmail,
          passwordHash,
          role: "tenant_admin",
          tenantId: tenant.tenantId,
        });

        return { tenant, account };
      });

      const data: CreateTenantAccountResult = {
        tenantId: result.tenant.tenantId,
        account: toAccountSummary(result.account),
      };
      return { ok: true, data };
    } catch (err) {
      return errResult(err);
    }
  }

  /**
   * DATA_ADAPTER=prisma 일 때는 실제 Postgres 트랜잭션(prisma.$transaction)으로
   * 테넌트+에이전트설정+계정 생성을 원자적으로 묶는다. 인메모리 모드는 단일
   * 프로세스 내 순차 호출로 충분하다(테스트/데모 용도, 롤백 필요 없음 — 실패
   * 시 그냥 예외를 던져 위 catch 로 전파한다).
   */
  private async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (process.env.DATA_ADAPTER === "prisma") {
      return prisma.$transaction(async () => fn());
    }
    return fn();
  }
}

/** companyName → URL-safe slug. onboarding.controller.ts 와 동일한 규칙. */
function slugify(companyName: string): string {
  const base = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "tenant"}-${suffix}`;
}
