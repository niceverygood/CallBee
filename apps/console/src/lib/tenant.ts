/**
 * 현재 콘솔 세션의 테넌트 컨텍스트.
 * 실제 인증(로그인 시 자기 테넌트만 접근)이 붙기 전까지는 목 테넌트 하나로 고정한다.
 */
import { createContext, useContext } from "react";

export interface TenantContextValue {
  tenantId: string;
}

export const TenantContext = createContext<TenantContextValue | null>(null);

export function useTenantId(): string {
  const ctx = useContext(TenantContext);
  if (!ctx) throw new Error("useTenantId must be used within <TenantContext.Provider>");
  return ctx.tenantId;
}
