import { Navigate, Outlet } from "react-router-dom";
import { IS_FIXTURE } from "../api/client";
import { useSession } from "../lib/useSession";

/**
 * 라우트 가드: fetch 모드에서 로그인 안 된 상태로 앱에 진입하면 /login 으로
 * 리다이렉트한다. fixture 모드는 항상 통과(로그인 화면을 건너뛰고 BoBi fixture
 * 로 바로 진입 — 기존 렌더 테스트 5개가 이 경로를 거치지 않지만, 혹시 App 전체를
 * 렌더하더라도 fixture 모드에서는 절대 로그인 화면을 보여주지 않아야 한다).
 */
export function RequireAuth() {
  const session = useSession();

  if (IS_FIXTURE) return <Outlet />;
  if (!session) return <Navigate to="/login" replace />;

  return <Outlet />;
}
