import { Navigate, Outlet } from "react-router-dom";
import { IS_FIXTURE, getCurrentTenantId } from "../api/client";
import { useSession } from "../lib/useSession";
import { useTenant } from "../api/hooks";
import { Loading } from "./StateBlock";

/**
 * 라우트 가드 (product-spec §3.1 확장):
 * 1) fetch 모드에서 로그인 안 된 상태로 앱에 진입하면 /login 으로 보낸다.
 *    데모(fixture) 모드는 세션 없이도 통과(BoBi 데모 사업장으로 진입).
 * 2) 세션의 사업장 status 가 pending_approval / rejected 면 콘솔의 **모든**
 *    라우트를 /pending 승인 대기·반려 화면으로 강제 리다이렉트한다
 *    (설정/통화 기록 접근 불가).
 */
export function RequireAuth() {
  const session = useSession();
  const tenantId = getCurrentTenantId();
  const { data: tenant, isLoading } = useTenant(tenantId ?? "");

  if (!IS_FIXTURE && !session) return <Navigate to="/login" replace />;
  if (!tenantId) return <Navigate to="/login" replace />;

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-ink-50">
        <Loading />
      </div>
    );
  }

  if (tenant && (tenant.status === "pending_approval" || tenant.status === "rejected")) {
    return <Navigate to="/pending" replace />;
  }

  return <Outlet />;
}
