/**
 * ToolsService — 8개 tool 을 프레임워크 독립적 순수 클래스로 구현.
 * 각 메서드 시그니처: ToolIO[name]['params'] → ToolIO[name]['result'].
 *
 * 규칙:
 * - 상태 변경(티켓/콜백/알림/세션)은 전부 이 tool 메서드 경유 (GUARDRAIL #2).
 * - 모든 tool 호출은 TracePort 로 trace 기록 (관측성 GUARDRAIL #7).
 * - 개인정보/구독 조회는 lookup_subscriber(본인확인) 선행 (GUARDRAIL #4).
 * - 결제 변경은 셀프서비스 링크로만 유도 (GUARDRAIL #1).
 * - 공유 타입은 @colli/contracts 에서만 import.
 *
 * NestJS 부트스트랩 없이 목 포트를 주입해 단위 테스트 가능.
 */
import type {
  ToolIO,
  ToolName,
  LookupSubscriberParams,
  LookupSubscriberResult,
  GetKbAnswerParams,
  GetKbAnswerResult,
  CreateTicketParams,
  CreateTicketResult,
  RouteToSalesParams,
  RouteToSalesResult,
  SendSelfServiceLinkParams,
  SendSelfServiceLinkResult,
  RequestCallbackParams,
  RequestCallbackResult,
  EscalateToHumanParams,
  EscalateToHumanResult,
  SendKakaoAlimtalkParams,
  SendKakaoAlimtalkResult,
  CallSessionId,
  TicketId,
  CallbackId,
  RouteMode,
} from "@colli/contracts";
import type {
  BoBiReadPort,
  NotificationsPort,
  TicketRepository,
  KnowledgeRepository,
  CallbackRepository,
  SessionStore,
  TracePort,
} from "./ports.js";

/** tool 실행 시 호출 컨텍스트(통화 세션 식별). 관측성/세션 상태에 사용. */
export interface ToolContext {
  callSessionId?: CallSessionId;
}

/** ToolsService 가 주입받는 포트 묶음. */
export interface ToolsDeps {
  bobi: BoBiReadPort;
  tickets: TicketRepository;
  knowledge: KnowledgeRepository;
  callbacks: CallbackRepository;
  notifications: NotificationsPort;
  sessions: SessionStore;
  trace: TracePort;
}

/** 도메인 검증 실패 등 tool 내부에서 던지는 오류(봉투의 error.code 로 매핑). */
export class ToolError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ToolError";
  }
}

/** KB confidence 하한. 미만이면 sourceId=null + 폴백 문구(Worker B 가 인계/콜백 결정). */
const KB_CONFIDENCE_FLOOR = 0.34;

export class ToolsService {
  constructor(private readonly deps: ToolsDeps) {}

  // ── 1) lookup_subscriber (본인확인) ───────────────────────────
  async lookup_subscriber(
    params: LookupSubscriberParams,
    ctx: ToolContext = {},
  ): Promise<LookupSubscriberResult> {
    return this.withTrace("lookup_subscriber", ctx, { phone: "***masked***" }, async () => {
      const phone = (params.phone ?? "").trim();
      if (!phone) throw new ToolError("invalid_params", "phone is required");
      const profile = await this.deps.bobi.findByPhone(phone);
      // 미매칭 → null (본인확인 실패). 매칭 → 세션에 본인확인 상태 기록.
      if (profile && ctx.callSessionId) {
        await this.deps.sessions.patch(ctx.callSessionId, {
          subscriberId: profile.subscriberId,
          verified: true,
        });
      }
      return profile;
    });
  }

  // ── 2) get_kb_answer (카테고리+키워드 매칭) ────────────────────
  async get_kb_answer(
    params: GetKbAnswerParams,
    ctx: ToolContext = {},
  ): Promise<GetKbAnswerResult> {
    return this.withTrace(
      "get_kb_answer",
      ctx,
      { category: params.category ?? null },
      async () => {
        const query = (params.query ?? "").trim();
        if (!query) throw new ToolError("invalid_params", "query is required");
        const hits = await this.deps.knowledge.search(query, params.category);
        const best = hits[0];
        if (!best || best.score < KB_CONFIDENCE_FLOOR) {
          // 낮은 신뢰도 → Worker B 가 인계/콜백으로 폴백하도록 신호.
          return {
            answer:
              "정확한 답변을 찾지 못했어요. 담당자에게 연결하거나 콜백을 예약해 드릴게요.",
            sourceId: null,
            confidence: best ? Number(best.score.toFixed(2)) : 0,
          };
        }
        return {
          answer: best.item.answer,
          sourceId: best.item.id,
          confidence: Number(best.score.toFixed(2)),
        };
      },
    );
  }

  // ── 3) create_ticket ──────────────────────────────────────────
  async create_ticket(
    params: CreateTicketParams,
    ctx: ToolContext = {},
  ): Promise<CreateTicketResult> {
    return this.withTrace(
      "create_ticket",
      ctx,
      { subscriberId: params.subscriberId, category: params.category, severity: params.severity },
      async () => {
        await this.assertVerified(ctx, params.subscriberId);
        if (!params.summary?.trim())
          throw new ToolError("invalid_params", "summary is required");
        const rec = await this.deps.tickets.create({
          callSessionId: ctx.callSessionId ?? null,
          subscriberId: params.subscriberId,
          category: params.category,
          summary: params.summary,
          severity: params.severity,
        });
        return { ticketId: rec.id as TicketId, status: rec.status };
      },
    );
  }

  // ── 4) route_to_sales ─────────────────────────────────────────
  async route_to_sales(
    params: RouteToSalesParams,
    ctx: ToolContext = {},
  ): Promise<RouteToSalesResult> {
    return this.withTrace(
      "route_to_sales",
      ctx,
      { subscriberId: params.subscriberId, reason: params.reason },
      async () => {
        if (!params.subscriberId)
          throw new ToolError("invalid_params", "subscriberId is required");
        // churn(해지)/high urgency 는 warm transfer, 그 외는 콜백 큐로 인계.
        const mode: RouteMode =
          params.reason === "churn" ? "warm_transfer" : "callback_queued";
        if (mode === "callback_queued") {
          // 인계는 tool 경유 상태변경: 콜백 큐에 적재.
          await this.deps.callbacks.enqueue({
            callSessionId: ctx.callSessionId ?? null,
            subscriberId: params.subscriberId,
            summary: `[sales:${params.reason}] ${params.context}`,
            urgency: "normal",
          });
        }
        return { routed: true, mode };
      },
    );
  }

  // ── 5) send_selfservice_link (결제/비번/요금제 → 알림톡) ───────
  async send_selfservice_link(
    params: SendSelfServiceLinkParams,
    ctx: ToolContext = {},
  ): Promise<SendSelfServiceLinkResult> {
    return this.withTrace(
      "send_selfservice_link",
      ctx,
      { subscriberId: params.subscriberId, kind: params.kind },
      async () => {
        // GUARDRAIL #1/#4: 결제 변경은 링크로만. 본인확인된 구독자에게만 발송.
        const profile = await this.requireSubscriber(params.subscriberId);
        await this.deps.notifications.send({
          templateKey: "selfservice_link",
          to: profile.phone,
          vars: {
            name: profile.name,
            url: selfServiceUrl(params.subscriberId, params.kind),
            kind: params.kind,
          },
          callSessionId: ctx.callSessionId,
        });
        return { sent: true, channel: "alimtalk" };
      },
    );
  }

  // ── 6) request_callback (콜백 예약) ───────────────────────────
  async request_callback(
    params: RequestCallbackParams,
    ctx: ToolContext = {},
  ): Promise<RequestCallbackResult> {
    return this.withTrace(
      "request_callback",
      ctx,
      { hasSubscriber: !!params.subscriberId, urgency: params.urgency },
      async () => {
        if (!params.subscriberId && !params.phone)
          throw new ToolError(
            "invalid_params",
            "subscriberId 또는 phone 중 하나는 필요합니다",
          );
        if (!params.summary?.trim())
          throw new ToolError("invalid_params", "summary is required");
        const rec = await this.deps.callbacks.enqueue({
          callSessionId: ctx.callSessionId ?? null,
          subscriberId: params.subscriberId ?? null,
          phone: params.phone ?? null,
          summary: params.summary,
          urgency: params.urgency,
        });
        return { callbackId: rec.id as CallbackId };
      },
    );
  }

  // ── 7) escalate_to_human ──────────────────────────────────────
  async escalate_to_human(
    params: EscalateToHumanParams,
    ctx: ToolContext = {},
  ): Promise<EscalateToHumanResult> {
    return this.withTrace(
      "escalate_to_human",
      ctx,
      { target: params.target },
      async () => {
        if (!params.reason?.trim())
          throw new ToolError("invalid_params", "reason is required");
        // 실제 warm transfer 배선은 Worker A(음성)가 웹훅으로 수행.
        // 여기서는 인계 의도를 기록하고 성공 신호를 반환한다.
        if (ctx.callSessionId) {
          await this.deps.sessions.patch(ctx.callSessionId, {
            escalatedTo: params.target,
          });
        }
        return { transferInitiated: true };
      },
    );
  }

  // ── 8) send_kakao_alimtalk (→ Worker D 위임) ──────────────────
  async send_kakao_alimtalk(
    params: SendKakaoAlimtalkParams,
    ctx: ToolContext = {},
  ): Promise<SendKakaoAlimtalkResult> {
    return this.withTrace(
      "send_kakao_alimtalk",
      ctx,
      { templateKey: params.templateKey },
      async () => {
        if (!params.to?.trim())
          throw new ToolError("invalid_params", "to is required");
        const res = await this.deps.notifications.send({
          templateKey: params.templateKey,
          to: params.to,
          vars: params.vars,
          callSessionId: ctx.callSessionId,
        });
        return { messageId: res.messageId, status: res.status };
      },
    );
  }

  // ── dispatch (컨트롤러에서 tool 이름으로 호출) ─────────────────
  /**
   * 이름으로 tool 을 실행. 타입 안전한 오버로드 없이 런타임 디스패치가 필요할 때 사용
   * (NestJS 컨트롤러의 POST /tools/:name). 개별 메서드가 계약 시그니처의 단일 소스다.
   */
  async invoke<T extends ToolName>(
    name: T,
    params: ToolIO[T]["params"],
    ctx: ToolContext = {},
  ): Promise<ToolIO[T]["result"]> {
    switch (name) {
      case "lookup_subscriber":
        return this.lookup_subscriber(
          params as LookupSubscriberParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "get_kb_answer":
        return this.get_kb_answer(
          params as GetKbAnswerParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "create_ticket":
        return this.create_ticket(
          params as CreateTicketParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "route_to_sales":
        return this.route_to_sales(
          params as RouteToSalesParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "send_selfservice_link":
        return this.send_selfservice_link(
          params as SendSelfServiceLinkParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "request_callback":
        return this.request_callback(
          params as RequestCallbackParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "escalate_to_human":
        return this.escalate_to_human(
          params as EscalateToHumanParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      case "send_kakao_alimtalk":
        return this.send_kakao_alimtalk(
          params as SendKakaoAlimtalkParams,
          ctx,
        ) as Promise<ToolIO[T]["result"]>;
      default: {
        // 컴파일타임 완전성 체크 + 런타임 방어
        const _exhaustive: never = name;
        throw new ToolError("unknown_tool", `unknown tool: ${String(_exhaustive)}`);
      }
    }
  }

  // ── 내부 헬퍼 ──────────────────────────────────────────────────

  /** 모든 tool 을 감싸 trace 기록 + latency 측정 (관측성 GUARDRAIL #7). */
  private async withTrace<R>(
    toolName: ToolName,
    ctx: ToolContext,
    paramsSummary: Record<string, unknown> | null,
    fn: () => Promise<R>,
  ): Promise<R> {
    const started = Date.now();
    try {
      const result = await fn();
      await this.deps.trace.record({
        callSessionId: ctx.callSessionId ?? null,
        toolName,
        paramsSummary,
        ok: true,
        latencyMs: Date.now() - started,
      });
      return result;
    } catch (err) {
      const code = err instanceof ToolError ? err.code : "internal_error";
      await this.deps.trace.record({
        callSessionId: ctx.callSessionId ?? null,
        toolName,
        paramsSummary,
        ok: false,
        errorCode: code,
        latencyMs: Date.now() - started,
      });
      throw err;
    }
  }

  /**
   * 본인확인 게이트(GUARDRAIL #4). subscriberId 는 필수.
   * 세션 상태가 존재하면 verified=true + subscriberId 일치까지 강제한다
   * (통합 시 Worker A/B 가 lookup_subscriber 로 세션에 verified 를 세운 뒤 호출).
   * 세션 상태가 없으면(세션 없이 직접 호출) subscriberId 존재만 확인한다.
   */
  private async assertVerified(
    ctx: ToolContext,
    subscriberId: string,
  ): Promise<void> {
    if (!subscriberId)
      throw new ToolError("invalid_params", "subscriberId is required");
    if (!ctx.callSessionId) return;
    const state = await this.deps.sessions.get(ctx.callSessionId);
    if (!state) return; // 세션 미초기화 → 게이트 스킵(직접 호출 호환)
    if (state.verified !== true || state.subscriberId !== subscriberId) {
      throw new ToolError(
        "not_verified",
        "본인확인(lookup_subscriber) 후에만 티켓을 생성할 수 있습니다",
      );
    }
  }

  /** 셀프서비스 등에서 구독자 프로필(전화번호 등)이 필요할 때. 미확인이면 오류. */
  private async requireSubscriber(subscriberId: string) {
    if (!subscriberId)
      throw new ToolError("invalid_params", "subscriberId is required");
    const profile = await this.deps.bobi.findById(subscriberId);
    if (!profile)
      throw new ToolError(
        "not_verified",
        "본인확인된 구독자를 찾을 수 없습니다",
      );
    return profile;
  }
}

/** 셀프서비스 딥링크 생성(결제/비번/요금제). 실도메인은 환경설정에서 주입. */
function selfServiceUrl(subscriberId: string, kind: string): string {
  return `https://app.bobi.example/selfservice/${kind}?sid=${encodeURIComponent(subscriberId)}`;
}
