/**
 * 얇은 NestJS 컨트롤러: 콘솔(apps/console) 셀프서비스 온보딩 신청 접수.
 * apps/console/src/api/types.ts 의 OnboardingDraft → OnboardingResult 계약.
 *
 * POST /onboarding
 *   body: OnboardingDraft (companyName/industryLabel/ownerEmail/requestedPhoneNumber)
 *   →     ApiResult<OnboardingResult> ({ tenant: TenantSummary, message: string })
 *
 * TenantRepository.create 로 테넌트를 만들고, TenantAgentConfigRepository.upsert 로
 * 기본 에이전트 설정(serviceName=companyName, agentName="상담원")을 함께 생성한다.
 * status="onboarding"/plan="trial" 은 각 어댑터의 기본값과 일치시켜 명시적으로 넘긴다.
 */
import { Body, Controller, Inject, Post } from "@nestjs/common";
import type { TenantSummary } from "@colli/contracts";
import type { TenantRepository, TenantAgentConfigRepository } from "./tenant.ports.js";
import { TENANT_REPO, TENANT_AGENT_CONFIG_REPO } from "./tokens.js";
import { WebhookValidationError } from "./webhook-validation.js";
import type { ApiResult } from "./tenants.controller.js";

export interface OnboardingRequestBody {
  companyName: string;
  industryLabel: string;
  ownerEmail: string;
  requestedPhoneNumber: string;
}

export interface OnboardingResultDto {
  tenant: TenantSummary;
  message: string;
}

function errResult(err: unknown): ApiResult<never> {
  if (err instanceof WebhookValidationError) {
    return { ok: false, error: { code: err.code, message: err.message } };
  }
  const message = err instanceof Error ? err.message : "unknown error";
  return { ok: false, error: { code: "internal_error", message } };
}

/** companyName → URL-safe slug. 충돌 방지용 짧은 접미사를 덧붙인다. */
function slugify(companyName: string): string {
  const base = companyName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9가-힣]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `${base || "tenant"}-${suffix}`;
}

@Controller("onboarding")
export class OnboardingController {
  constructor(
    @Inject(TENANT_REPO) private readonly tenants: TenantRepository,
    @Inject(TENANT_AGENT_CONFIG_REPO)
    private readonly agentConfigs: TenantAgentConfigRepository,
  ) {}

  @Post()
  async submit(
    @Body() body: OnboardingRequestBody,
  ): Promise<ApiResult<OnboardingResultDto>> {
    try {
      if (
        !body.companyName?.trim() ||
        !body.ownerEmail?.trim() ||
        !body.requestedPhoneNumber?.trim()
      ) {
        throw new WebhookValidationError(
          "invalid_params",
          "companyName, ownerEmail, requestedPhoneNumber are required",
        );
      }
      const tenant = await this.tenants.create({
        slug: slugify(body.companyName),
        name: body.companyName,
        industryLabel: body.industryLabel ?? null,
        phoneNumber: body.requestedPhoneNumber,
        status: "onboarding",
        plan: "trial",
        ownerEmail: body.ownerEmail,
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

      return {
        ok: true,
        data: {
          tenant,
          message: "온보딩 신청이 접수되었습니다.",
        },
      };
    } catch (err) {
      return errResult(err);
    }
  }
}
