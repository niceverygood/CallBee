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
import { Body, Controller, Get, Inject, Post, UseGuards } from "@nestjs/common";
import type {
  AdminAccountSummary,
  CreateTenantAccountRequest,
  CreateTenantAccountResult,
  LoginRequest,
  LoginResponse,
  TenantSummary,
} from "@colli/contracts";
import { prisma } from "@colli/db";
import type { TenantRepository, TenantAgentConfigRepository } from "./tenant.ports.js";
import type { AdminAccountRepository, AdminAccountRecord } from "./auth/auth.repository.js";
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

@Controller()
export class AuthController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(TENANT_AGENT_CONFIG_REPO)
    private readonly agentConfigs: TenantAgentConfigRepository,
    @Inject(ADMIN_ACCOUNT_REPO) private readonly accounts: AdminAccountRepository,
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

  // ── platform_admin 전용: 전체 테넌트 목록 ───────────────────
  @UseGuards(AuthGuard)
  @RequireRole("platform_admin")
  @Get("admin/tenants")
  async listTenants(): Promise<ApiResult<TenantSummary[]>> {
    const list = await this.tenants.list();
    return { ok: true, data: list };
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
