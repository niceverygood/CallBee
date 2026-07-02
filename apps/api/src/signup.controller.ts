/**
 * 얇은 NestJS 컨트롤러: 셀프 가입(공개, 무인증) — product-spec §2 가입 위저드 제출.
 *
 * POST /signup (하위호환 별칭: POST /auth/signup)
 *   body: SignupRequest → ApiResult<SignupResult>
 *
 * 성공 시 하나의 트랜잭션으로(auth.controller.ts 의 runInTransaction 패턴 재사용):
 *   ① Tenant 생성 — status=pending_approval, phoneNumber=makePendingPhoneNumber(slug)
 *     (070 번호는 승인 시 관리자가 배정 — 신청 시점엔 플레이스홀더), industryKey/
 *     industryLabel(프리셋 label 또는 "기타" 직접 입력값)/contactPhone/appliedAt/plan.
 *   ② 기본 TenantAgentConfig — onboarding.controller.ts 와 동일 값
 *     (serviceName=businessName, agentName="상담원").
 *   ③ AdminAccount(tenant_admin) 생성.
 * 응답에 signToken 세션 토큰을 포함해 콘솔이 즉시 로그인 상태로 승인 대기
 * 화면(/pending)에 진입한다.
 *
 * 검증 규칙(product-spec §2, 실패 시 invalid_params):
 * - email: RFC 간이 형식 + 소문자 정규화. 중복이면 email_already_exists.
 * - password: 8자 이상, 공백 문자 불가.
 * - businessName: 1~60자(공백만은 불가).
 * - industryKey: INDUSTRY_PRESETS 의 key. "other" 면 industryCustomLabel(1~30자) 필수.
 * - contactPhone: 숫자/하이픈만, 숫자 9~13자리.
 * - plan: TENANT_PLANS 중 하나.
 */
import { Body, Controller, Inject, Post } from "@nestjs/common";
import {
  findIndustryPreset,
  makePendingPhoneNumber,
  TENANT_PLANS,
  type SignupRequest,
  type SignupResult,
  type TenantPlan,
} from "@colli/contracts";
import { prisma } from "@colli/db";
import type { TenantRepository, TenantAgentConfigRepository } from "./tenant.ports.js";
import type { AdminAccountRepository } from "./auth/auth.repository.js";
import { TENANT_REPO, TENANT_AGENT_CONFIG_REPO, ADMIN_ACCOUNT_REPO } from "./tokens.js";
import { hashPassword } from "./auth/password.js";
import { signToken } from "./auth/token.js";
import { WebhookValidationError } from "./webhook-validation.js";
import type { ApiResult } from "./tenants.controller.js";

/** RFC 간이 이메일 형식 검증(정확한 RFC 파서는 범위 밖 — 스펙 명시 "간이"). */
export function isValidEmailFormat(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * 전화번호 형식 검증 — 숫자/하이픈만 허용, 숫자 9~13자리(product-spec §2/§3.2).
 * contactPhone(가입)/phoneNumber(승인 070 배정)/transferPhoneNumber(호전환) 공용.
 */
export function isValidPhoneNumberFormat(value: string): boolean {
  if (!/^[0-9-]+$/.test(value)) return false;
  const digits = value.replace(/-/g, "");
  return digits.length >= 9 && digits.length <= 13;
}

function invalid(message: string): WebhookValidationError {
  return new WebhookValidationError("invalid_params", message);
}

/**
 * SignupRequest 검증 + 정규화. 실패 시 WebhookValidationError("invalid_params").
 * 반환값은 저장에 바로 쓸 수 있는 정규화된 필드들이다.
 */
export function validateSignupRequest(body: SignupRequest): {
  email: string;
  password: string;
  businessName: string;
  industryKey: string;
  industryLabel: string;
  contactPhone: string;
  plan: TenantPlan;
} {
  const email = (body.email ?? "").trim().toLowerCase();
  if (!isValidEmailFormat(email)) {
    throw invalid("email 형식을 확인해 주세요");
  }

  const password = body.password ?? "";
  if (password.length < 8 || /\s/.test(password)) {
    throw invalid("password 는 공백 없이 8자 이상이어야 합니다");
  }

  const businessName = (body.businessName ?? "").trim();
  if (businessName.length < 1 || businessName.length > 60) {
    throw invalid("businessName 은 1~60자여야 합니다");
  }

  const industryKey = body.industryKey ?? "";
  const preset = findIndustryPreset(industryKey);
  if (!preset) {
    throw invalid(`industryKey 는 INDUSTRY_PRESETS 중 하나여야 합니다: ${industryKey}`);
  }
  let industryLabel = preset.label;
  if (preset.key === "other") {
    const custom = (body.industryCustomLabel ?? "").trim();
    if (custom.length < 1 || custom.length > 30) {
      throw invalid("업종 '기타' 선택 시 industryCustomLabel(1~30자)이 필수입니다");
    }
    industryLabel = custom;
  }

  const contactPhone = (body.contactPhone ?? "").trim();
  if (!isValidPhoneNumberFormat(contactPhone)) {
    throw invalid("contactPhone 은 숫자/하이픈만, 숫자 9~13자리여야 합니다");
  }

  if (!TENANT_PLANS.includes(body.plan as TenantPlan)) {
    throw invalid(`plan 은 TENANT_PLANS 중 하나여야 합니다: ${String(body.plan)}`);
  }

  return {
    email,
    password,
    businessName,
    industryKey: preset.key,
    industryLabel,
    contactPhone,
    plan: body.plan,
  };
}

function errResult(err: unknown): ApiResult<never> {
  if (err instanceof WebhookValidationError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { ok: false, error: { code: "internal_error", message } };
}

/** businessName → URL-safe slug. auth/onboarding.controller.ts 와 동일 규칙. */
function slugify(businessName: string): string {
  const base = businessName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "tenant"}-${suffix}`;
}

@Controller()
export class SignupController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(TENANT_AGENT_CONFIG_REPO)
    private readonly agentConfigs: TenantAgentConfigRepository,
    @Inject(ADMIN_ACCOUNT_REPO) private readonly accounts: AdminAccountRepository,
  ) {}

  // 공개(무인증). 정식 경로는 POST /signup(product-spec §2), /auth/signup 은
  // 로그인 경로(POST /auth/login)와 대칭을 원하는 소비자를 위한 별칭.
  @Post(["signup", "auth/signup"])
  async signup(@Body() body: SignupRequest): Promise<ApiResult<SignupResult>> {
    try {
      const v = validateSignupRequest(body);

      const existing = await this.accounts.findByEmail(v.email);
      if (existing) {
        throw new WebhookValidationError(
          "email_already_exists",
          "이미 가입된 이메일이에요. 로그인해 주세요.",
        );
      }

      const passwordHash = hashPassword(v.password);
      const slug = slugify(v.businessName);
      const now = new Date().toISOString();

      const result = await this.runInTransaction(async () => {
        const tenant = await this.tenants.create({
          slug,
          name: v.businessName,
          industryLabel: v.industryLabel,
          industryKey: v.industryKey,
          // 070 번호는 승인 시 배정 — NOT NULL/unique 유지를 위한 플레이스홀더.
          phoneNumber: makePendingPhoneNumber(slug),
          status: "pending_approval",
          plan: v.plan,
          ownerEmail: v.email,
          contactPhone: v.contactPhone,
          appliedAt: now,
        });

        // 기본 에이전트 설정(onboarding.controller.ts 와 동일 값).
        await this.agentConfigs.upsert(tenant.tenantId, {
          serviceName: v.businessName,
          agentName: "상담원",
          greetingText: null,
          personaInstructions: null,
          toneExtra: [],
          domainConstraints: [],
          intentUnresolvedFallbackTool: "request_callback",
          maxIntentAttempts: 2,
        });

        const account = await this.accounts.create({
          email: v.email,
          passwordHash,
          role: "tenant_admin",
          tenantId: tenant.tenantId,
        });

        return { tenant, account };
      });

      const token = signToken({
        accountId: result.account.accountId,
        role: result.account.role,
        tenantId: result.account.tenantId,
      });

      const data: SignupResult = {
        tenantId: result.tenant.tenantId,
        account: {
          accountId: result.account.accountId,
          email: result.account.email,
          role: result.account.role,
          tenantId: result.account.tenantId,
          createdAt: result.account.createdAt,
        },
        tenantStatus: "pending_approval",
        token,
      };
      return { ok: true, data };
    } catch (err) {
      return errResult(err);
    }
  }

  /** auth.controller.ts 와 동일: prisma 모드에서만 실제 DB 트랜잭션으로 묶는다. */
  private async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (process.env.DATA_ADAPTER === "prisma") {
      return prisma.$transaction(async () => fn());
    }
    return fn();
  }
}
