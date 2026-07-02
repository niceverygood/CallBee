/**
 * 목(mock) 데이터 소스 — 데모 모드(VITE_DATA_SOURCE!=="fetch") 전용.
 *
 * 기본 사업장은 BoBi(테넌트 #1) — /docs/tenant-platform-architecture.md §4 의
 * 시드 값 명세를 그대로 반영한다(에이전트 설정/의도 7종). v3 에서 통화 기록
 * fixture 와 "가입 데모용 승인 대기 사업장"(DEMO_PENDING_TENANT_ID)이 추가됐다.
 *
 * 브랜드ID 는 문자열이므로 `as` 캐스팅으로 만든다(런타임 동일, 타입 안전용).
 */
import type {
  TenantId,
  TenantToolId,
  TenantIntentKey,
  KnowledgeItemId,
  CallSessionId,
} from "@colli/contracts";
import type {
  TenantSummary,
  TenantAgentConfig,
  TenantIntentDefinition,
  CustomToolDefinition,
  KnowledgeItem,
  TenantCallDetail,
} from "./types";

const tenantId = (s: string) => s as unknown as TenantId;
const toolId = (s: string) => s as unknown as TenantToolId;
const intentKey = (s: string) => s as unknown as TenantIntentKey;
const kid = (s: string) => s as unknown as KnowledgeItemId;
const callId = (s: string) => s as unknown as CallSessionId;

export const BOBI_TENANT_ID = tenantId("tenant_bobi");

/**
 * 가입 위저드 데모용 승인 대기 사업장. 데모 모드에서 /signup 을 제출하면
 * 이 사업장에 입력값이 덮어써지고(인메모리) 세션이 이 사업장으로 연결돼
 * /pending 승인 대기 화면을 실제로 볼 수 있다. 새로고침하면 기본값으로 복원.
 */
export const DEMO_PENDING_TENANT_ID = tenantId("tenant_pending_demo");

export const TENANTS: TenantSummary[] = [
  {
    tenantId: BOBI_TENANT_ID,
    slug: "bobi",
    name: "BoBi",
    industryLabel: "보험설계사 SaaS",
    phoneNumber: "07052361037",
    status: "active",
    plan: "enterprise",
    industryKey: "other",
    contactPhone: "02-1234-5678",
    appliedAt: "2026-05-02T10:00:00+09:00",
    approvedAt: "2026-05-03T09:30:00+09:00",
  },
  {
    tenantId: DEMO_PENDING_TENANT_ID,
    slug: "dalkom-pasta",
    name: "달콤한 파스타",
    industryLabel: "식당·카페",
    phoneNumber: "pending-dalkom-pasta",
    status: "pending_approval",
    plan: "trial",
    industryKey: "restaurant_cafe",
    contactPhone: "02-555-0100",
    appliedAt: "2026-07-01T11:20:00+09:00",
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
    // v3 커스텀 확장 — 기본값(전부 비어있음 = 골든 패리티 상태)
    closingText: null,
    businessHours: null,
    afterHoursMode: "callback",
    afterHoursText: null,
    transferPhoneNumber: null,
    emergencyKeywords: [],
    smsSettings: null,
  },
  [DEMO_PENDING_TENANT_ID]: {
    tenantId: DEMO_PENDING_TENANT_ID,
    serviceName: "달콤한 파스타",
    agentName: "상담원",
    greetingText: null,
    personaInstructions: null,
    toneExtra: [],
    domainConstraints: [],
    intentUnresolvedFallbackTool: "request_callback",
    maxIntentAttempts: 2,
    closingText: null,
    businessHours: null,
    afterHoursMode: "callback",
    afterHoursText: null,
    transferPhoneNumber: null,
    emergencyKeywords: [],
    smsSettings: null,
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
  [DEMO_PENDING_TENANT_ID]: [],
};

export const TOOLS_BY_TENANT: Record<string, CustomToolDefinition[]> = {
  // BoBi(테넌트 #1)는 8개 시스템 tool 만 사용하므로 커스텀 tool 0건(§4.4 참조).
  [BOBI_TENANT_ID]: [
    {
      toolId: toolId("tool_check_reservation"),
      tenantId: BOBI_TENANT_ID,
      name: "check_reservation",
      description: "예시 연동: 외부 예약 시스템에서 예약 정보를 조회한다.",
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
  [DEMO_PENDING_TENANT_ID]: [],
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
      enabled: true,
      updatedAt: "2026-06-20T09:00:00+09:00",
    },
    {
      id: kid("kb_002"),
      category: "billing",
      question: "결제수단(카드) 변경",
      answer:
        "보안을 위해 카드정보는 전화로 받지 않습니다. 알림톡으로 발송되는 셀프서비스 링크에서 직접 변경해 주세요.",
      tags: ["결제", "카드", "셀프서비스"],
      enabled: true,
      updatedAt: "2026-06-22T09:00:00+09:00",
    },
  ],
  [DEMO_PENDING_TENANT_ID]: [],
};

// ── 통화 기록 fixture (BoBi) — GET /tenants/:id/calls 목 데이터 ──
export const CALLS_BY_TENANT: Record<string, TenantCallDetail[]> = {
  [BOBI_TENANT_ID]: [
    {
      id: callId("call_1006"),
      from: "01099875678",
      to: "07052361037",
      direction: "inbound",
      intent: "usage",
      outcome: "kb_answered",
      startedAt: "2026-07-01T18:42:00+09:00",
      durationSec: 96,
      recordingUrl: null,
      summary:
        "고객 그룹 배정 방법 문의. 지식베이스 답변(고객 관리 > 그룹 메뉴)으로 즉시 안내 완료.",
      transcript: [
        { role: "system", text: "통화가 연결되었습니다. 서비스 품질을 위해 통화가 녹음됩니다.", atSec: 0 },
        { role: "agent", text: "안녕하세요, BoBi 고객센터의 AI 상담원 보비입니다. 무엇을 도와드릴까요?", atSec: 2 },
        { role: "caller", text: "고객을 그룹으로 나누고 싶은데 어디서 하나요?", atSec: 9 },
        {
          role: "agent",
          text: "고객 관리 메뉴의 그룹 탭에서 '새 그룹'을 만들고 고객을 드래그해 배정하실 수 있어요. 더 도와드릴 게 있을까요?",
          atSec: 15,
        },
        { role: "caller", text: "아니요, 됐어요. 감사합니다.", atSec: 28 },
      ],
      toolInvocations: ["get_kb_answer"],
    },
    {
      id: callId("call_1005"),
      from: "01044321234",
      to: "07052361037",
      direction: "inbound",
      intent: "billing",
      outcome: "selfservice_sent",
      startedAt: "2026-07-01T14:05:00+09:00",
      durationSec: 143,
      recordingUrl: null,
      summary:
        "결제 카드 변경 요청. 정책상 전화로 카드정보를 받지 않음을 안내하고 셀프서비스 링크를 문자로 발송.",
      transcript: [
        { role: "agent", text: "안녕하세요, BoBi 고객센터의 AI 상담원 보비입니다.", atSec: 2 },
        { role: "caller", text: "결제 카드를 바꾸고 싶어요. 번호 불러드릴게요.", atSec: 8 },
        {
          role: "agent",
          text: "보안을 위해 카드 정보는 전화로 받지 않아요. 방금 문자로 보내드린 링크에서 직접 변경하실 수 있어요.",
          atSec: 14,
        },
      ],
      toolInvocations: ["verify_subscriber", "send_selfservice_link"],
    },
    {
      id: callId("call_1004"),
      from: "01055559012",
      to: "07052361037",
      direction: "inbound",
      intent: "tech_error",
      outcome: "ticket_created",
      startedAt: "2026-06-30T16:27:00+09:00",
      durationSec: 210,
      recordingUrl: null,
      summary: "고객 목록 업로드 실패 오류 신고. 재현 정보 접수 후 기술 지원 티켓 생성.",
      transcript: [
        { role: "caller", text: "엑셀 업로드가 계속 실패해요.", atSec: 7 },
        {
          role: "agent",
          text: "불편을 드려 죄송해요. 오류가 난 파일 형식과 화면 메시지를 확인해 접수해 드릴게요.",
          atSec: 12,
        },
      ],
      toolInvocations: ["verify_subscriber", "create_ticket"],
    },
    {
      id: callId("call_1003"),
      from: "01077773456",
      to: "07052361037",
      direction: "inbound",
      intent: "upgrade",
      outcome: "transferred",
      startedAt: "2026-06-30T11:12:00+09:00",
      durationSec: 187,
      recordingUrl: null,
      summary: "Pro 요금제 업그레이드 상담 요청. 영업 담당자에게 호전환.",
      transcript: [
        { role: "caller", text: "Pro 플랜으로 바꾸면 뭐가 달라지나요?", atSec: 6 },
        { role: "agent", text: "요금제 상담은 담당자를 연결해 드릴게요. 잠시만 기다려 주세요.", atSec: 40 },
      ],
      toolInvocations: ["route_to_sales", "escalate_to_human"],
    },
    {
      id: callId("call_1002"),
      from: "01022227890",
      to: "07052361037",
      direction: "inbound",
      intent: null,
      outcome: "callback_queued",
      startedAt: "2026-06-29T20:48:00+09:00",
      durationSec: 74,
      recordingUrl: null,
      summary: "문의 내용이 명확하지 않아 연락처를 받아 콜백 접수.",
      transcript: [
        { role: "caller", text: "저기… 그… 뭐 좀 물어보려고요.", atSec: 5 },
        {
          role: "agent",
          text: "성함과 연락처를 남겨주시면 담당자가 영업시간에 바로 연락드릴게요.",
          atSec: 34,
        },
      ],
      toolInvocations: ["request_callback"],
    },
    {
      id: callId("call_1001"),
      from: "01033214567",
      to: "07052361037",
      direction: "inbound",
      intent: "usage",
      outcome: "abandoned",
      startedAt: "2026-06-29T09:03:00+09:00",
      durationSec: 21,
      recordingUrl: null,
      summary: null,
      transcript: [
        { role: "agent", text: "안녕하세요, BoBi 고객센터의 AI 상담원 보비입니다.", atSec: 2 },
      ],
      toolInvocations: [],
    },
  ],
  [DEMO_PENDING_TENANT_ID]: [],
};
