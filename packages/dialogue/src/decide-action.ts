/**
 * 의도별 tool 라우팅 + fallback/escalation 정책 (Worker B).
 *
 * `decideAction(state)` 는 순수 함수로, 현재 대화 상태를 받아
 * "다음에 어떤 tool 을 어떤 이유로 호출할지"를 결정론적으로 결정한다.
 * 실제 tool 실행은 Worker C, 세션 배선은 Worker A 가 한다.
 *
 * 라우팅 규칙 (worker-contracts "Worker B" 절):
 *  - 의도 파악 2회 이상 실패 → request_callback (무한 루프 금지)
 *  - upgrade/churn/new_signup → route_to_sales (reason: upgrade/churn/new_lead)
 *  - tech_error → create_ticket (개발팀)
 *  - billing → send_selfservice_link (kind='billing', 카드정보 음성수집 금지)
 *  - usage → get_kb_answer (confidence 낮으면 escalate/callback 폴백)
 *  - 보험상품 권유/판단/진단 → escalate_to_human (cs 또는 sales)
 *  - other → get_kb_answer 시도 후 실패 시 request_callback
 *
 * ⚠️ LLM 을 호출하지 않는다.
 */
import type {
  Intent,
  ToolName,
  SalesReason,
  SelfServiceKind,
  EscalationTarget,
  Emotion,
} from "@colli/contracts";

/** decideAction 이 반환하는 상위 행동 유형 (관측성/분기용). */
export const DIALOGUE_ACTIONS = [
  "answer_from_kb",
  "route_sales",
  "create_ticket",
  "send_selfservice",
  "escalate",
  "request_callback",
  "reask", // 되물어 의도 재파악
] as const;
export type DialogueAction = (typeof DIALOGUE_ACTIONS)[number];

/** decideAction 입력 상태. 런타임(A/C)이 채워 전달한다. */
export interface DialogueState {
  /** 현재 파악된 의도. 아직 파악 못 했으면 null. */
  intent: Intent | null;
  /** 의도 분류 신뢰도(0~1). LLM 또는 classifyIntent 결과. */
  confidence?: number;
  /** 지금까지 의도 파악을 시도한 횟수(되물음 포함). */
  intentAttempts?: number;
  /** 본인확인(lookup_subscriber) 성공 여부. */
  identityVerified?: boolean;
  /** get_kb_answer 를 이미 시도했고 confidence 가 낮았는지(폴백 판단용). */
  kbLowConfidence?: boolean;
  /** 보험상품 권유/판단/진단 요청이 감지되었는지(범위 밖 → 사람 인계). */
  insuranceAdviceRequested?: boolean;
  /** 감정 태그(있으면 힌트/우선인계에 반영). */
  emotion?: Emotion;
}

/** decideAction 결과. */
export interface DialogueDecision {
  /** 호출할 tool. 되물음 등 tool 이 필요 없으면 null. */
  tool: ToolName | null;
  /** 상위 행동 유형. */
  action: DialogueAction;
  /** 결정 사유(로그/trace용, 한국어). */
  reason: string;
  /** route_to_sales 용 reason 매핑(해당 시). */
  salesReason?: SalesReason;
  /** send_selfservice_link 용 kind(해당 시). */
  selfServiceKind?: SelfServiceKind;
  /** escalate_to_human 용 target(해당 시). */
  escalationTarget?: EscalationTarget;
  /** 감정 대응 힌트(angry/urgent 등). 없으면 null. */
  emotionHint: string | null;
  /** 우선 인계 권장 여부(angry/urgent). */
  prioritize: boolean;
}

/** 의도 파악 실패로 콜백 폴백에 들어가는 시도 임계값. */
export const MAX_INTENT_ATTEMPTS = 2;

/** usage/other KB 폴백 confidence 임계값 미만이면 인계/콜백. */
export const KB_CONFIDENCE_THRESHOLD = 0.5;

/** upgrade/churn/new_signup → SalesReason 매핑. */
const INTENT_TO_SALES_REASON: Partial<Record<Intent, SalesReason>> = {
  upgrade: "upgrade",
  churn: "churn",
  new_signup: "new_lead",
};

function emotionSideEffects(emotion?: Emotion): {
  hint: string | null;
  prioritize: boolean;
} {
  switch (emotion) {
    case "angry":
      return {
        hint: "고객이 화가 났습니다. 먼저 사과하고 속도를 늦추며, 우선 인계를 고려하세요.",
        prioritize: true,
      };
    case "urgent":
      return {
        hint: "급한 사안입니다. 우선순위를 높여 빠르게 인계/콜백으로 연결하세요.",
        prioritize: true,
      };
    case "confused":
      return {
        hint: "고객이 혼란스러워합니다. 더 쉽고 천천히 한 번에 하나씩 설명하세요.",
        prioritize: false,
      };
    default:
      return { hint: null, prioritize: false };
  }
}

/**
 * 대화 상태 → 다음 행동 결정 (순수 함수).
 */
export function decideAction(state: DialogueState): DialogueDecision {
  const attempts = state.intentAttempts ?? 0;
  const { hint, prioritize } = emotionSideEffects(state.emotion);

  const base = { emotionHint: hint, prioritize } as const;

  // ── 0) 보험상품 권유/판단/진단 요청 → 무조건 사람 인계 (GUARDRAIL #5) ──
  // 의도/신뢰도와 무관하게 최우선. 범위 밖이므로 escalate.
  if (state.insuranceAdviceRequested) {
    return {
      ...base,
      tool: "escalate_to_human",
      action: "escalate",
      reason:
        "보험상품 권유/판단/진단 요청은 응대 범위 밖이므로 사람에게 인계한다.",
      // 리텐션·영업 성격이 아니라 일반 상담 범위 밖 → cs 로 인계.
      escalationTarget: "cs",
    };
  }

  // ── 1) 의도 파악 반복 실패 → 콜백 (무한 루프 금지) ──
  // 의도가 아직 없거나 'other' 로만 잡히고, 임계 시도를 넘었으면 콜백.
  const intentUnresolved = state.intent === null || state.intent === "other";
  if (intentUnresolved && attempts >= MAX_INTENT_ATTEMPTS) {
    return {
      ...base,
      tool: "request_callback",
      action: "request_callback",
      reason: `의도 파악을 ${attempts}회 시도했으나 실패하여 콜백을 예약한다(무한 루프 방지).`,
    };
  }

  // 아직 의도를 못 잡았고 임계 미만이면 한 번 더 되묻는다(tool 없음).
  if (state.intent === null) {
    return {
      ...base,
      tool: null,
      action: "reask",
      reason: "의도가 아직 파악되지 않아 한 번 더 되물어 명확히 한다.",
    };
  }

  // ── 2) 의도별 라우팅 ──
  switch (state.intent) {
    case "upgrade":
    case "churn":
    case "new_signup": {
      const salesReason = INTENT_TO_SALES_REASON[state.intent];
      return {
        ...base,
        tool: "route_to_sales",
        action: "route_sales",
        reason: `${state.intent} 의도 → 영업/리텐션(route_to_sales)으로 인계한다.`,
        salesReason,
      };
    }

    case "tech_error": {
      return {
        ...base,
        tool: "create_ticket",
        action: "create_ticket",
        reason: "기술오류(tech_error) → 개발팀 처리 티켓(create_ticket)을 생성한다.",
      };
    }

    case "billing": {
      // 카드정보 음성수집 금지 → 셀프서비스 링크로만 유도 (GUARDRAIL #1).
      return {
        ...base,
        tool: "send_selfservice_link",
        action: "send_selfservice",
        reason:
          "결제(billing) → 카드정보 음성수집 금지, 셀프서비스 링크(send_selfservice_link)로 유도한다.",
        selfServiceKind: "billing",
      };
    }

    case "usage": {
      // KB 를 이미 시도했는데 confidence 가 낮으면 폴백.
      if (state.kbLowConfidence || isLowConfidence(state.confidence)) {
        // 급하거나 화난 상태면 사람 인계, 아니면 콜백.
        if (prioritize) {
          return {
            ...base,
            tool: "escalate_to_human",
            action: "escalate",
            reason:
              "usage 답변 신뢰도가 낮고 우선 인계가 필요하여 사람(cs)에게 인계한다.",
            escalationTarget: "cs",
          };
        }
        return {
          ...base,
          tool: "request_callback",
          action: "request_callback",
          reason:
            "usage 답변 신뢰도가 낮아 즉답이 어려워 콜백을 예약한다.",
        };
      }
      return {
        ...base,
        tool: "get_kb_answer",
        action: "answer_from_kb",
        reason: "사용법(usage) → 지식베이스에서 답변(get_kb_answer)을 검색한다.",
      };
    }

    case "other": {
      // other 는 KB 시도 후 실패 시 콜백.
      if (state.kbLowConfidence || isLowConfidence(state.confidence)) {
        return {
          ...base,
          tool: "request_callback",
          action: "request_callback",
          reason:
            "기타(other) 의도이며 KB 답변 실패 → 콜백을 예약한다.",
        };
      }
      return {
        ...base,
        tool: "get_kb_answer",
        action: "answer_from_kb",
        reason: "기타(other) → 우선 지식베이스(get_kb_answer)로 답변을 시도한다.",
      };
    }

    default: {
      // 도달 불가(모든 Intent 처리됨) — 방어적으로 콜백.
      return {
        ...base,
        tool: "request_callback",
        action: "request_callback",
        reason: "분류되지 않은 상태 — 방어적으로 콜백을 예약한다.",
      };
    }
  }
}

function isLowConfidence(confidence?: number): boolean {
  return typeof confidence === "number" && confidence < KB_CONFIDENCE_THRESHOLD;
}
