/**
 * 목(mock) 데이터 소스. 백엔드(apps/api 테넌트 엔드포인트)가 뜨기 전 UI 렌더/개발용.
 * VITE_DATA_SOURCE=fetch 로 전환하면 실제 API 를 호출한다(client.ts 참조).
 *
 * 기본 테넌트는 BoBi(테넌트 #1) — /docs/tenant-platform-architecture.md §4 의
 * 시드 값 명세를 그대로 반영한다(에이전트 설정/의도 7종).
 *
 * 브랜드ID 는 문자열이므로 `as` 캐스팅으로 만든다(런타임 동일, 타입 안전용).
 */
import type {
  TenantId,
  TenantToolId,
  TenantIntentKey,
  KnowledgeItemId,
} from "@colli/contracts";
import type {
  TenantSummary,
  TenantAgentConfig,
  TenantIntentDefinition,
  CustomToolDefinition,
  KnowledgeItem,
} from "./types";

const tenantId = (s: string) => s as unknown as TenantId;
const toolId = (s: string) => s as unknown as TenantToolId;
const intentKey = (s: string) => s as unknown as TenantIntentKey;
const kid = (s: string) => s as unknown as KnowledgeItemId;

export const BOBI_TENANT_ID = tenantId("tenant_bobi");

export const TENANTS: TenantSummary[] = [
  {
    tenantId: BOBI_TENANT_ID,
    slug: "bobi",
    name: "BoBi",
    industryLabel: "보험설계사 SaaS",
    phoneNumber: "07052361037",
    status: "active",
    plan: "enterprise",
  },
];

export const AGENT_CONFIGS: Record<string, TenantAgentConfig> = {
  [BOBI_TENANT_ID]: {
    tenantId: BOBI_TENANT_ID,
    serviceName: "BoBi",
    agentName: "보비",
    greetingText: null,
    personaInstructions:
      "BoBi는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다. 전화로 걸려온 BoBi 유료 구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다. 응대 범위는 BoBi(소프트웨어) 사용 지원에 한정됩니다.",
    toneExtra: [],
    domainConstraints: [
      "보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의 역할은 BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련 질문이 오면 escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.",
    ],
    intentUnresolvedFallbackTool: "request_callback",
    maxIntentAttempts: 2,
  },
};

export const INTENTS_BY_TENANT: Record<string, TenantIntentDefinition[]> = {
  [BOBI_TENANT_ID]: [
    {
      key: intentKey("usage"),
      label: "사용법",
      keywords: ["사용", "방법", "어떻게", "메뉴", "기능"],
      routingToolName: "get_kb_answer",
      sortOrder: 0,
      enabled: true,
    },
    {
      key: intentKey("billing"),
      label: "결제",
      keywords: ["결제", "카드", "청구", "환불", "요금"],
      routingToolName: "send_selfservice_link",
      sortOrder: 1,
      enabled: true,
    },
    {
      key: intentKey("tech_error"),
      label: "기술오류",
      keywords: ["오류", "에러", "안돼요", "실패", "버그"],
      routingToolName: "create_ticket",
      sortOrder: 2,
      enabled: true,
    },
    {
      key: intentKey("upgrade"),
      label: "요금제·업그레이드",
      keywords: ["업그레이드", "플랜", "요금제 변경", "Pro"],
      routingToolName: "route_to_sales",
      sortOrder: 3,
      enabled: true,
    },
    {
      key: intentKey("churn"),
      label: "해지",
      keywords: ["해지", "탈퇴", "그만"],
      routingToolName: "route_to_sales",
      sortOrder: 4,
      enabled: true,
    },
    {
      key: intentKey("new_signup"),
      label: "신규가입",
      keywords: ["가입", "신규", "시작하고 싶어요"],
      routingToolName: "route_to_sales",
      sortOrder: 5,
      enabled: true,
    },
    {
      key: intentKey("other"),
      label: "기타",
      keywords: [],
      routingToolName: null,
      sortOrder: 6,
      enabled: true,
    },
  ],
};

export const TOOLS_BY_TENANT: Record<string, CustomToolDefinition[]> = {
  // BoBi(테넌트 #1)는 8개 시스템 tool 만 사용하므로 커스텀 tool 0건(§4.4 참조).
  [BOBI_TENANT_ID]: [
    {
      toolId: toolId("tool_check_reservation"),
      tenantId: BOBI_TENANT_ID,
      name: "check_reservation",
      description: "예시 커스텀 tool: 외부 예약 시스템에서 예약 정보를 조회한다.",
      paramsSchema: {
        type: "object",
        properties: {
          reservationCode: {
            type: "string",
            description: "예약 확인 코드",
          },
        },
        required: ["reservationCode"],
        additionalProperties: false,
      },
      webhookUrl: "https://example-tenant.com/webhooks/check-reservation",
      hasWebhookSecret: true,
      timeoutMs: 8000,
      enabled: true,
    },
  ],
};

export const KB_BY_TENANT: Record<string, KnowledgeItem[]> = {
  [BOBI_TENANT_ID]: [
    {
      id: kid("kb_001"),
      category: "usage",
      question: "고객을 그룹으로 나누는 방법",
      answer:
        "고객 관리 > 그룹 메뉴에서 '새 그룹'을 만들고 고객을 드래그해 배정할 수 있습니다.",
      tags: ["그룹", "고객관리", "세그먼트"],
      updatedAt: "2026-06-20T09:00:00+09:00",
    },
    {
      id: kid("kb_002"),
      category: "billing",
      question: "결제수단(카드) 변경",
      answer:
        "보안을 위해 카드정보는 전화로 받지 않습니다. 알림톡으로 발송되는 셀프서비스 링크에서 직접 변경해 주세요.",
      tags: ["결제", "카드", "셀프서비스"],
      updatedAt: "2026-06-22T09:00:00+09:00",
    },
  ],
};
