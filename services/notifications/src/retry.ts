/**
 * 발송 재시도 정책 (지수 백오프).
 * 실패 시 attempts/lastError 를 서비스가 기록하도록, 여기선 시도 실행만 담당한다.
 */

export interface RetryPolicy {
  /** 최대 시도 횟수(첫 시도 포함). 기본 3. */
  maxAttempts: number;
  /** 첫 백오프(ms). 기본 200. */
  baseDelayMs: number;
  /** 백오프 배수. 기본 2 (지수). */
  factor: number;
  /** 백오프 상한(ms). 기본 5000. */
  maxDelayMs: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 200,
  factor: 2,
  maxDelayMs: 5000,
};

/** attempt(0-based)에 대한 대기 시간(ms) 계산. */
export function backoffDelay(attempt: number, policy: RetryPolicy): number {
  const raw = policy.baseDelayMs * Math.pow(policy.factor, attempt);
  return Math.min(raw, policy.maxDelayMs);
}

/** 주입 가능한 sleep(테스트에서 즉시 반환하도록 교체). */
export type SleepFn = (ms: number) => Promise<void>;

export const realSleep: SleepFn = (ms) =>
  new Promise((resolve) => setTimeout(resolve, ms));

/** 한 번의 시도 결과. ok=false 면 재시도 대상. */
export type AttemptOutcome<T> =
  | { ok: true; value: T }
  | { ok: false; error: { code: string; message: string } };

export interface RunWithRetryResult<T> {
  /** 최종 성공 값(성공 시). */
  outcome: AttemptOutcome<T>;
  /** 실제 시도 횟수. */
  attempts: number;
  /** 마지막 실패 에러(성공으로 끝났으면 null). */
  lastError: { code: string; message: string } | null;
}

/**
 * attempt 를 최대 maxAttempts 회 시도한다. 실패 사이에 지수 백오프.
 * onAttempt 콜백으로 각 시도 결과를 서비스가 관측(상태/attempts 기록)할 수 있다.
 */
export async function runWithRetry<T>(
  attempt: () => Promise<AttemptOutcome<T>>,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  sleep: SleepFn = realSleep,
  onAttempt?: (
    attemptNumber: number,
    outcome: AttemptOutcome<T>,
  ) => void | Promise<void>,
): Promise<RunWithRetryResult<T>> {
  let lastError: { code: string; message: string } | null = null;

  for (let i = 0; i < policy.maxAttempts; i++) {
    const outcome = await attempt();
    await onAttempt?.(i + 1, outcome);

    if (outcome.ok) {
      return { outcome, attempts: i + 1, lastError: null };
    }

    lastError = outcome.error;
    const isLast = i === policy.maxAttempts - 1;
    if (!isLast) {
      await sleep(backoffDelay(i, policy));
    }
  }

  return {
    outcome: { ok: false, error: lastError! },
    attempts: policy.maxAttempts,
    lastError,
  };
}
