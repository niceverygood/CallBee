/**
 * NotificationsService — 알림톡 발송 오케스트레이션.
 * 렌더 → provider 발송(재시도) → 상태추적(queued/sent/delivered/failed) → Notification 기록.
 *
 * Worker C 의 send_kakao_alimtalk tool 이 이 서비스를 호출한다.
 * 반환은 contracts 의 SendKakaoAlimtalkResult (messageId/status) 와 정렬된다.
 */
import type {
  KakaoTemplateKey,
  KakaoTemplateVarMap,
  NotificationId,
  SendKakaoAlimtalkResult,
} from "@colli/contracts";
import type { AlimtalkProvider } from "./provider.js";
import type { NotificationRepository } from "./repository.js";
import { renderTemplate } from "./templates.js";
import {
  DEFAULT_RETRY_POLICY,
  realSleep,
  runWithRetry,
  type RetryPolicy,
  type SleepFn,
} from "./retry.js";

export interface NotificationsServiceDeps {
  provider: AlimtalkProvider;
  repository: NotificationRepository;
  retryPolicy?: RetryPolicy;
  /** 주입 가능한 sleep(테스트에서 즉시 반환). 기본 실제 setTimeout. */
  sleep?: SleepFn;
}

/** sendAlimtalk 상세 결과(서비스 내부/테스트용). tool 반환은 toToolResult 로 축약. */
export interface SendAlimtalkOutcome {
  messageId: NotificationId;
  status: SendKakaoAlimtalkResult["status"];
  attempts: number;
  providerMsgId: string | null;
  lastError: string | null;
}

export class NotificationsService {
  private readonly provider: AlimtalkProvider;
  private readonly repository: NotificationRepository;
  private readonly retryPolicy: RetryPolicy;
  private readonly sleep: SleepFn;

  constructor(deps: NotificationsServiceDeps) {
    this.provider = deps.provider;
    this.repository = deps.repository;
    this.retryPolicy = deps.retryPolicy ?? DEFAULT_RETRY_POLICY;
    this.sleep = deps.sleep ?? realSleep;
  }

  /**
   * 템플릿을 렌더해 대행사로 발송하고 상태를 추적/기록한다.
   *
   * 상태 전이:
   *   queued(레코드 생성) → [발송 시도 × N] → sent(성공) | failed(재시도 소진)
   * delivered 는 대행사 콜백(수신확인) 시점에 markDelivered 로 별도 전이한다.
   */
  async sendAlimtalk<K extends KakaoTemplateKey>(
    templateKey: K,
    to: string,
    vars: KakaoTemplateVarMap[K],
  ): Promise<SendAlimtalkOutcome> {
    // 1) 렌더 (키↔Vars 타입 안전)
    const text = renderTemplate(templateKey, vars);

    // 2) queued 레코드 생성
    const record = await this.repository.create({
      templateKey,
      toNumber: to,
      vars,
      status: "queued",
    });
    const id = record.id;

    // 3) 발송 + 재시도. 각 시도마다 attempts/lastError 를 기록.
    const result = await runWithRetry(
      async () => {
        const res = await this.provider.send({ templateKey, to, text });
        if (res.ok) {
          return { ok: true as const, value: res.providerMsgId };
        }
        return { ok: false as const, error: res.error };
      },
      this.retryPolicy,
      this.sleep,
      async (attemptNumber, outcome) => {
        await this.repository.update(id, {
          attempts: attemptNumber,
          lastError: outcome.ok
            ? null
            : `${outcome.error.code}: ${outcome.error.message}`,
        });
      },
    );

    // 4) 최종 상태 전이 + 기록
    if (result.outcome.ok) {
      const providerMsgId = result.outcome.value;
      await this.repository.update(id, {
        status: "sent",
        providerMsgId,
        sentAt: new Date(),
        lastError: null,
      });
      return {
        messageId: id,
        status: "sent",
        attempts: result.attempts,
        providerMsgId,
        lastError: null,
      };
    }

    const lastError = result.lastError
      ? `${result.lastError.code}: ${result.lastError.message}`
      : "unknown error";
    await this.repository.update(id, {
      status: "failed",
      lastError,
    });
    return {
      messageId: id,
      status: "failed",
      attempts: result.attempts,
      providerMsgId: null,
      lastError,
    };
  }

  /**
   * 대행사 수신확인 콜백 시 delivered 로 전이한다(sent → delivered).
   * Worker A/C 의 웹훅에서 providerMsgId 로 매칭 후 호출하는 훅.
   */
  async markDelivered(id: NotificationId): Promise<void> {
    await this.repository.update(id, { status: "delivered" });
  }

  /**
   * Worker C 의 send_kakao_alimtalk tool 이 직접 소비하는 축약 결과.
   * contracts 의 SendKakaoAlimtalkResult 시그니처와 일치한다.
   */
  async sendForTool<K extends KakaoTemplateKey>(
    templateKey: K,
    to: string,
    vars: KakaoTemplateVarMap[K],
  ): Promise<SendKakaoAlimtalkResult> {
    const outcome = await this.sendAlimtalk(templateKey, to, vars);
    return { messageId: outcome.messageId, status: outcome.status };
  }
}
