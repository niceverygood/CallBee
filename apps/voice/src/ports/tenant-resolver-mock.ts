/**
 * InMemoryTenantResolver — TenantResolverPort 의 인메모리 목.
 *
 * toNumber → ResolvedTenantAgentContext 매핑을 등록해두고 조회한다.
 * `BOBI_TENANT_CONTEXT` 는 /docs/tenant-platform-architecture.md §4(BoBi → 테넌트 #1
 * 마이그레이션 시드 명세)의 값을 그대로 반영한 기본 테넌트 — BoBi 070 번호
 * (07052361037)로 걸려오는 통화는 기존 PLACEHOLDER_SYSTEM_PROMPT/TOOL_SCHEMA_LIST
 * 배선과 동등한 결과(시스템 tool 8종 전체 + BoBi 톤의 system prompt)를 재현해야
 * 회귀가 없다.
 */
import {
  TOOL_SCHEMA_LIST,
  type ResolvedTenantAgentContext,
  type RuntimeToolSchema,
  type TenantAgentConfig,
  type TenantId,
  type TenantIntentDefinition,
  type TenantIntentKey,
  type TenantSummary,
} from "@colli/contracts";
import type { TenantResolverPort } from "./tenant-resolver.js";

/** BoBi(테넌트 #1) 070 번호 — .env CLAWOPS_070_NUMBER 와 동일(설계 문서 §4.1) */
export const BOBI_PHONE_NUMBER = "07052361037";

const BOBI_TENANT_ID = "tenant_bobi" as TenantId;

const BOBI_SUMMARY: TenantSummary = {
  tenantId: BOBI_TENANT_ID,
  slug: "bobi",
  name: "BoBi",
  industryLabel: "보험설계사 SaaS",
  phoneNumber: BOBI_PHONE_NUMBER,
  status: "active",
  plan: "enterprise",
};

const BOBI_AGENT_CONFIG: TenantAgentConfig = {
  tenantId: BOBI_TENANT_ID,
  serviceName: "BoBi",
  agentName: "보비",
  greetingText: null,
  personaInstructions:
    "BoBi는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다. 전화로 걸려온 BoBi 유료 " +
    "구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다. 응대 범위는 BoBi(소프트웨어) " +
    "사용 지원에 한정됩니다.",
  toneExtra: [],
  domainConstraints: [
    "보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의 역할은 " +
      "BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련 질문이 오면 " +
      "escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.",
  ],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};

/** 기존 `INTENTS`/`INTENT_LABELS`/classify-intent.ts KEYWORD_MAP 이식(설계 문서 §4.3) */
const BOBI_INTENTS: TenantIntentDefinition[] = [
  {
    key: "usage" as TenantIntentKey,
    label: "사용법",
    keywords: ["사용법", "어떻게", "방법", "기능"],
    routingToolName: "get_kb_answer",
    sortOrder: 0,
    enabled: true,
  },
  {
    key: "billing" as TenantIntentKey,
    label: "결제",
    keywords: ["결제", "청구", "카드", "환불", "요금"],
    routingToolName: "send_selfservice_link",
    sortOrder: 1,
    enabled: true,
  },
  {
    key: "tech_error" as TenantIntentKey,
    label: "기술오류",
    keywords: ["오류", "에러", "버그", "안돼요", "안됩니다"],
    routingToolName: "create_ticket",
    sortOrder: 2,
    enabled: true,
  },
  {
    key: "upgrade" as TenantIntentKey,
    label: "요금제·업그레이드",
    keywords: ["업그레이드", "플랜", "요금제 변경", "상위"],
    routingToolName: "route_to_sales",
    sortOrder: 3,
    enabled: true,
  },
  {
    key: "churn" as TenantIntentKey,
    label: "해지",
    keywords: ["해지", "탈퇴", "취소"],
    routingToolName: "route_to_sales",
    sortOrder: 4,
    enabled: true,
  },
  {
    key: "new_signup" as TenantIntentKey,
    label: "신규가입",
    keywords: ["신규", "가입", "시작하고"],
    routingToolName: "route_to_sales",
    sortOrder: 5,
    enabled: true,
  },
  {
    key: "other" as TenantIntentKey,
    label: "기타",
    keywords: [],
    routingToolName: null,
    sortOrder: 6,
    enabled: true,
  },
];

/** 시스템 tool 8종 전체를 kind:"system" 으로 태깅(설계 문서 §4.4 — BoBi 는 커스텀 tool 0행) */
const BOBI_TOOL_SCHEMAS: RuntimeToolSchema[] = TOOL_SCHEMA_LIST.map((schema) => ({
  ...schema,
  kind: "system" as const,
}));

export const BOBI_TENANT_CONTEXT: ResolvedTenantAgentContext = {
  tenant: BOBI_SUMMARY,
  agentConfig: BOBI_AGENT_CONFIG,
  intents: BOBI_INTENTS,
  toolSchemas: BOBI_TOOL_SCHEMAS,
};

export class InMemoryTenantResolver implements TenantResolverPort {
  private readonly byPhone = new Map<string, ResolvedTenantAgentContext>();

  constructor(
    seed: ReadonlyArray<ResolvedTenantAgentContext> = [BOBI_TENANT_CONTEXT],
  ) {
    for (const ctx of seed) {
      this.byPhone.set(ctx.tenant.phoneNumber, ctx);
    }
  }

  /** 테스트에서 가상 테넌트를 추가 등록할 때 사용 */
  register(ctx: ResolvedTenantAgentContext): void {
    this.byPhone.set(ctx.tenant.phoneNumber, ctx);
  }

  async resolve(toNumber: string): Promise<ResolvedTenantAgentContext | null> {
    return this.byPhone.get(toNumber) ?? null;
  }
}
