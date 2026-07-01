import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import type { RenderResult } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TenantContext } from "../lib/tenant";
import { FIXTURE_TENANT_ID } from "../api/client";

/**
 * 테스트용 렌더 헬퍼: QueryClient + MemoryRouter 로 감싼다.
 * fixture 모드가 기본이므로 목 데이터가 로드된다.
 */
export function renderWithProviders(
  ui: ReactElement,
  { route = "/" }: { route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  );
}

/**
 * TenantContext 를 필요로 하는 탭 페이지(에이전트 설정/의도/tool/KB)용 렌더 헬퍼.
 * 기본 테넌트(BoBi 목 데이터)로 스코프한다.
 */
export function renderWithTenant(
  ui: ReactElement,
  { tenantId = FIXTURE_TENANT_ID, route = "/" }: { tenantId?: string; route?: string } = {},
): RenderResult {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <TenantContext.Provider value={{ tenantId }}>{ui}</TenantContext.Provider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}
