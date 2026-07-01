/**
 * ToolClient 포트 (Worker A → Worker C 경계).
 *
 * 세션 핸들러/Voice Agent 는 tool 을 직접 구현하지 않는다(GUARDRAIL #2, 범위 밖).
 * 대신 이 포트를 통해 Worker C 의 tool 엔드포인트로 HTTP POST 위임하고,
 * 계약(@colli/contracts)의 `ToolInvocationResult` 봉투를 그대로 돌려받는다.
 *
 * 멀티테넌트 확장(v2): 커스텀 tool(webhook 기반)은 apps/api 가 tenantId 로 스코프
 * 조회해야 하므로, 세션 핸들러는 tenantId 를 호출 컨텍스트로 함께 전달한다.
 * 실 HTTP 구현(통합 배선 단계, Orchestrator 소유)은 이 값을 `x-tenant-id` 헤더에
 * 실어 `POST /tools/:name` 에 위임한다(apps/api 의 `ToolsController` 확정 컨벤션 —
 * `x-call-session-id` 헤더와 동일한 소문자 kebab-case). 시스템 tool 8종은 v1과
 * 동일한 경로/바디를 그대로 쓰고, apps/api 는 name ∉ SYSTEM_TOOL_NAMES 일 때만
 * 이 헤더를 필수로 요구해 `CustomToolExecutor`(webhook 프록시)로 위임한다.
 * `ctx` 는 optional — 기존 호출부/목(테스트)이 무수정으로 계속 동작해야 한다.
 *
 * 여기서는 인터페이스만 정의하고, 테스트/데모는 인메모리 목(mock)으로 대체한다.
 */
import type {
  ToolName,
  ToolParams,
  ToolInvocationResult,
  TenantId,
} from "@colli/contracts";

/** tool 호출 컨텍스트 — 세션에 바인딩된 테넌트 식별자(멀티테넌트 확장, optional) */
export interface ToolInvokeContext {
  tenantId?: TenantId;
}

export interface ToolClient {
  /**
   * 단일 tool 을 Worker C 에 위임 실행한다.
   * @param tool   계약상의 tool 이름
   * @param params 계약상의 해당 tool 파라미터
   * @param ctx    호출 컨텍스트(tenantId 등). 미지정 시 기존 v1 동작과 동일.
   * @returns      성공/실패를 감싼 `ToolInvocationResult` 봉투
   */
  invoke<T extends ToolName>(
    tool: T,
    params: ToolParams<T>,
    ctx?: ToolInvokeContext,
  ): Promise<ToolInvocationResult<T>>;
}
