/**
 * Tool 함수 계약 (단일 소스).
 * - LLM function-calling 스키마(TOOL_SCHEMAS)와 백엔드 구현(Worker C)이 공유한다.
 * - 상태 변경은 반드시 이 tool 들을 통해서만 일어난다 (GUARDRAIL #2).
 */
import type {
  SubscriberId,
  SubscriberProfile,
  TicketId,
  TicketStatus,
  TicketCategory,
  TicketSeverity,
  CallbackId,
  CallbackUrgency,
  SalesReason,
  RouteMode,
  EscalationTarget,
  SelfServiceKind,
  NotificationId,
  KnowledgeItemId,
} from "./domain.js";
import type { KakaoTemplateKey, KakaoTemplateVars } from "./kakao.js";

// ── tool 이름 ───────────────────────────────────────────────────
export const TOOL_NAMES = [
  "lookup_subscriber",
  "get_kb_answer",
  "create_ticket",
  "route_to_sales",
  "send_selfservice_link",
  "request_callback",
  "escalate_to_human",
  "send_kakao_alimtalk",
] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

// ── 각 tool 의 파라미터 / 결과 ──────────────────────────────────

export interface LookupSubscriberParams {
  /** 가입 전화번호(E.164 권장) */
  phone: string;
}
/** 미매칭이면 null (본인확인 실패로 취급) */
export type LookupSubscriberResult = SubscriberProfile | null;

export interface GetKbAnswerParams {
  query: string;
  category?: TicketCategory;
}
export interface GetKbAnswerResult {
  answer: string;
  sourceId: KnowledgeItemId | null;
  /** 0~1. 낮으면 Worker B 가 인계/콜백으로 폴백 */
  confidence: number;
}

export interface CreateTicketParams {
  subscriberId: SubscriberId;
  category: TicketCategory;
  summary: string;
  severity: TicketSeverity;
}
export interface CreateTicketResult {
  ticketId: TicketId;
  status: TicketStatus;
}

export interface RouteToSalesParams {
  subscriberId: SubscriberId;
  reason: SalesReason;
  context: string;
}
export interface RouteToSalesResult {
  routed: boolean;
  mode: RouteMode;
}

export interface SendSelfServiceLinkParams {
  subscriberId: SubscriberId;
  kind: SelfServiceKind;
}
export interface SendSelfServiceLinkResult {
  sent: boolean;
  channel: "alimtalk";
}

export interface RequestCallbackParams {
  /** subscriberId 또는 phone 중 하나 이상 필요 */
  subscriberId?: SubscriberId;
  phone?: string;
  summary: string;
  urgency: CallbackUrgency;
}
export interface RequestCallbackResult {
  callbackId: CallbackId;
}

export interface EscalateToHumanParams {
  reason: string;
  target: EscalationTarget;
}
export interface EscalateToHumanResult {
  transferInitiated: boolean;
}

export interface SendKakaoAlimtalkParams {
  templateKey: KakaoTemplateKey;
  /** 수신 전화번호 */
  to: string;
  vars: KakaoTemplateVars;
}
export interface SendKakaoAlimtalkResult {
  messageId: NotificationId;
  status: "sent" | "queued" | "failed";
}

// ── tool 이름 → (params, result) 매핑 ───────────────────────────
export interface ToolIO {
  lookup_subscriber: {
    params: LookupSubscriberParams;
    result: LookupSubscriberResult;
  };
  get_kb_answer: { params: GetKbAnswerParams; result: GetKbAnswerResult };
  create_ticket: { params: CreateTicketParams; result: CreateTicketResult };
  route_to_sales: { params: RouteToSalesParams; result: RouteToSalesResult };
  send_selfservice_link: {
    params: SendSelfServiceLinkParams;
    result: SendSelfServiceLinkResult;
  };
  request_callback: {
    params: RequestCallbackParams;
    result: RequestCallbackResult;
  };
  escalate_to_human: {
    params: EscalateToHumanParams;
    result: EscalateToHumanResult;
  };
  send_kakao_alimtalk: {
    params: SendKakaoAlimtalkParams;
    result: SendKakaoAlimtalkResult;
  };
}

export type ToolParams<T extends ToolName> = ToolIO[T]["params"];
export type ToolResult<T extends ToolName> = ToolIO[T]["result"];

/**
 * tool 실행 공통 응답 봉투 (Worker A ↔ Worker C 간 HTTP 경계).
 * 백엔드는 성공/실패를 항상 이 형태로 감싸 반환한다.
 */
export type ToolInvocationResult<T extends ToolName = ToolName> =
  | { ok: true; tool: T; data: ToolResult<T> }
  | { ok: false; tool: T; error: { code: string; message: string } };

// ── LLM function-calling JSON 스키마 ────────────────────────────
// OpenAI Realtime / Chat function 정의로 그대로 사용 가능한 형태.
export interface ToolJsonSchema {
  name: ToolName;
  description: string;
  parameters: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
    additionalProperties: false;
  };
}

export const TOOL_SCHEMAS: Record<ToolName, ToolJsonSchema> = {
  lookup_subscriber: {
    name: "lookup_subscriber",
    description:
      "가입 전화번호로 BoBi 구독자를 조회해 본인확인한다. 개인정보/구독 조회 전 반드시 선행. 미매칭이면 null.",
    parameters: {
      type: "object",
      properties: {
        phone: { type: "string", description: "가입 전화번호(E.164 권장)" },
      },
      required: ["phone"],
      additionalProperties: false,
    },
  },
  get_kb_answer: {
    name: "get_kb_answer",
    description:
      "지식베이스에서 BoBi 사용/문의에 대한 답변을 검색한다. confidence 가 낮으면 인계·콜백으로 폴백.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "사용자 질문 원문" },
        category: {
          type: "string",
          enum: [
            "usage",
            "billing",
            "tech_error",
            "upgrade",
            "churn",
            "new_signup",
            "other",
          ],
          description: "선택: 의도 카테고리 힌트",
        },
      },
      required: ["query"],
      additionalProperties: false,
    },
  },
  create_ticket: {
    name: "create_ticket",
    description: "기술오류/처리요청을 티켓으로 생성한다(개발/CS 처리 대상).",
    parameters: {
      type: "object",
      properties: {
        subscriberId: { type: "string" },
        category: {
          type: "string",
          enum: [
            "usage",
            "billing",
            "tech_error",
            "upgrade",
            "churn",
            "new_signup",
            "other",
          ],
        },
        summary: { type: "string", description: "문의 요약(개인정보 최소화)" },
        severity: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
        },
      },
      required: ["subscriberId", "category", "summary", "severity"],
      additionalProperties: false,
    },
  },
  route_to_sales: {
    name: "route_to_sales",
    description:
      "업그레이드/해지/신규 리드를 영업(리텐션)으로 인계한다. warm transfer 또는 콜백 큐.",
    parameters: {
      type: "object",
      properties: {
        subscriberId: { type: "string" },
        reason: { type: "string", enum: ["upgrade", "churn", "new_lead"] },
        context: { type: "string", description: "인계 맥락 요약" },
      },
      required: ["subscriberId", "reason", "context"],
      additionalProperties: false,
    },
  },
  send_selfservice_link: {
    name: "send_selfservice_link",
    description:
      "결제/비밀번호/요금제 변경은 음성으로 처리하지 않고 셀프서비스 링크(알림톡)로만 유도한다. 카드정보 음성수집 금지.",
    parameters: {
      type: "object",
      properties: {
        subscriberId: { type: "string" },
        kind: {
          type: "string",
          enum: ["billing", "password", "plan_change"],
        },
      },
      required: ["subscriberId", "kind"],
      additionalProperties: false,
    },
  },
  request_callback: {
    name: "request_callback",
    description:
      "즉시 처리 불가/의도 파악 반복 실패 시 콜백을 예약한다(무한 루프 방지). subscriberId 또는 phone 필요.",
    parameters: {
      type: "object",
      properties: {
        subscriberId: { type: "string" },
        phone: { type: "string" },
        summary: { type: "string" },
        urgency: { type: "string", enum: ["low", "normal", "high"] },
      },
      required: ["summary", "urgency"],
      additionalProperties: false,
    },
  },
  escalate_to_human: {
    name: "escalate_to_human",
    description: "범위 밖/민감 사안을 사람에게 인계한다(sales/dev/cs).",
    parameters: {
      type: "object",
      properties: {
        reason: { type: "string" },
        target: { type: "string", enum: ["sales", "dev", "cs"] },
      },
      required: ["reason", "target"],
      additionalProperties: false,
    },
  },
  send_kakao_alimtalk: {
    name: "send_kakao_alimtalk",
    description:
      "카카오 알림톡 템플릿을 발송한다(접수/티켓/처리결과/콜백/셀프서비스).",
    parameters: {
      type: "object",
      properties: {
        templateKey: {
          type: "string",
          enum: [
            "cs_received",
            "ticket_created",
            "ticket_resolved",
            "callback_scheduled",
            "selfservice_link",
          ],
        },
        to: { type: "string", description: "수신 전화번호" },
        vars: { type: "object", description: "템플릿 변수 바인딩" },
      },
      required: ["templateKey", "to", "vars"],
      additionalProperties: false,
    },
  },
};

/** OpenAI Realtime/Chat tools 배열로 바로 넘길 수 있는 형태 */
export const TOOL_SCHEMA_LIST: ToolJsonSchema[] = TOOL_NAMES.map(
  (n) => TOOL_SCHEMAS[n],
);
