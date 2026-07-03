import { Navigate, Outlet } from "react-router-dom";
import { IS_FIXTURE } from "../api/client";
import { useSession } from "../lib/useSession";

/**
 * /admin(총괄관리자) 라우트 가드.
 * - fetch 모드: platform_admin 세션만 통과. tenant_admin 은 자기 대시보드로,
 *   비로그인은 /login 으로 보낸다.
 * - 데모(fixture) 모드: 세션 없이 통과(관리자 화면도 목 데이터로 체험 가능 —
 *   RequireAuth 의 fixture 통과 규칙과 동일한 데모 원칙).
 */
export function RequirePlatformAdmin() {
  const session = useSession();

  if (IS_FIXTURE) return <Outlet />;
  if (!session) return <Navigate to="/login" replace />;
  if (session.account.role !== "platform_admin") {
    const tenantId = session.account.tenantId;
    return <Navigate to={tenantId ? `/tenants/${tenantId}/dashboard` : "/"} replace />;
  }
  return <Outlet />;
}
