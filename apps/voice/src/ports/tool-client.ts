/**
 * ToolClient 포트 (Worker A → Worker C 경계).
 *
 * 세션 핸들러/Voice Agent 는 tool 을 직접 구현하지 않는다(GUARDRAIL #2, 범위 밖).
 * 대신 이 포트를 통해 Worker C 의 tool 엔드포인트로 HTTP POST 위임하고,
 * 계약(@colli/contracts)의 `ToolInvocationResult` 봉투를 그대로 돌려받는다.
 *
 * 실제 HTTP 구현은 통합 배선 단계(Orchestrator)에서 주입한다.
 * 여기서는 인터페이스만 정의하고, 테스트/데모는 인메모리 목(mock)으로 대체한다.
 */
import type {
  ToolName,
  ToolParams,
  ToolInvocationResult,
} from "@colli/contracts";

export interface ToolClient {
  /**
   * 단일 tool 을 Worker C 에 위임 실행한다.
   * @param tool   계약상의 tool 이름
   * @param params 계약상의 해당 tool 파라미터
   * @returns      성공/실패를 감싼 `ToolInvocationResult` 봉투
   */
  invoke<T extends ToolName>(
    tool: T,
    params: ToolParams<T>,
  ): Promise<ToolInvocationResult<T>>;
}
