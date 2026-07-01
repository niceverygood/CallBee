/**
 * MockAlimtalkProvider — 테스트/데모용 목 대행사.
 * 실제 HTTP 호출 없이 성공/실패 시나리오를 시뮬레이션한다.
 */
import type {
  AlimtalkProvider,
  AlimtalkSendPayload,
  AlimtalkSendResult,
} from "./provider.js";

export interface MockProviderOptions {
  /**
   * 실패 스케줄. 각 send 호출마다 앞에서부터 하나씩 소비한다.
   * true = 그 시도는 실패, false = 성공. 스케줄이 소진되면 항상 성공.
   * 예) [true, true] → 1·2번째 실패, 3번째부터 성공 (재시도→성공 검증용).
   */
  failFor?: boolean[];
  /** 항상 실패시킨다(failFor 보다 우선). 재시도 소진 검증용. */
  alwaysFail?: boolean;
  /** 실패 시 반환할 에러 코드/메시지. */
  error?: { code: string; message: string };
  /** providerMsgId 생성기(기본: 증가 카운터). */
  makeId?: (payload: AlimtalkSendPayload, callIndex: number) => string;
}

export class MockAlimtalkProvider implements AlimtalkProvider {
  /** 수신한 모든 페이로드(발송 순서대로) — 테스트 검증용. */
  readonly sent: AlimtalkSendPayload[] = [];
  private callIndex = 0;
  private readonly failSchedule: boolean[];

  constructor(private readonly opts: MockProviderOptions = {}) {
    this.failSchedule = [...(opts.failFor ?? [])];
  }

  /** 총 호출 횟수(성공+실패). */
  get callCount(): number {
    return this.callIndex;
  }

  async send(payload: AlimtalkSendPayload): Promise<AlimtalkSendResult> {
    const idx = this.callIndex++;
    this.sent.push(payload);

    const scheduledFail = this.failSchedule.shift() ?? false;
    if (this.opts.alwaysFail || scheduledFail) {
      return {
        ok: false,
        error:
          this.opts.error ?? {
            code: "PROVIDER_ERROR",
            message: "mock provider forced failure",
          },
      };
    }

    const providerMsgId =
      this.opts.makeId?.(payload, idx) ?? `mock-msg-${idx + 1}`;
    return { ok: true, providerMsgId };
  }
}
