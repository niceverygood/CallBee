/**
 * TenantResolverPort — 070 수신번호 → 테넌트 에이전트 컨텍스트 조회 (Worker A → Worker C 경계).
 *
 * 인바운드 콜의 `event.to`(070 번호)로 apps/api 의 테넌트 조회 엔드포인트를
 * 호출해 `ResolvedTenantAgentContext`(계약, @colli/contracts)를 받아온다.
 * 확인됨(apps/api/src/tenants.controller.ts, api 워커 완료): 실제 경로는
 * `GET /tenants/resolve?toNumber=...`, 응답 봉투는
 * `{ok:true, data:ResolvedTenantAgentContext} | {ok:false, error:{code,message}}`
 * (미등록 번호는 `error.code === "tenant_not_found"`). 실 HTTP 어댑터는 `ok:false`
 * 를 이 포트의 `null` 반환으로 정규화해야 한다.
 *
 * 시그니처는 계약의 `TenantAgentContextResolver` 와 동일하다 — 여기서는 Worker A
 * 쪽 포트 이름으로 재노출해 세션 핸들러가 의존성 주입(DI) 지점으로 참조하게 한다.
 * 미등록 070 번호(테넌트 없음)면 null 을 반환한다 — 세션 핸들러는 이 경우 안전한
 * 폴백 경로(안내 후 hang_up)로 빠진다.
 *
 * 실제 HTTP 구현(apps/api 호출)은 통합 배선 단계(Orchestrator)에서 주입한다.
 * 여기서는 인터페이스만 정의하고, 테스트/데모는 인메모리 목(mock)으로 대체한다.
 */
import type { ResolvedTenantAgentContext } from "@colli/contracts";

export interface TenantResolverPort {
  /**
   * 070 수신번호(E.164)로 테넌트 에이전트 컨텍스트를 조회한다.
   * @param toNumber 인바운드 콜의 수신번호(ClawOpsEvent.to)
   * @returns 등록된 테넌트가 있으면 ResolvedTenantAgentContext, 없으면 null
   */
  resolve(toNumber: string): Promise<ResolvedTenantAgentContext | null>;
}
