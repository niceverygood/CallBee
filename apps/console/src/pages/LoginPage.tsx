import { useState } from "react";
import type { FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { useLogin } from "../api/hooks";
import { loginSession } from "../lib/session";
import { useSession } from "../lib/useSession";
import { inputCls } from "../components/FormField";

/**
 * 콘솔(tenant_admin) 전용 로그인 화면.
 * platform_admin 계정으로 로그인을 시도하면 거부하고 apps/admin 을 안내한다
 * (역할 스왑 방지 — apps/admin 은 반대로 tenant_admin 을 거부한다).
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);
  const login = useLogin();
  const session = useSession();

  // 로그인 성공 시 loginSession() 이 세션 pub/sub 을 갱신 → 이 컴포넌트가
  // useSession() 구독으로 재렌더되어 여기서 리다이렉트한다(이 라우트는
  // RequireAuth 밖에 있어 별도 처리가 필요하다).
  if (session) return <Navigate to="/" replace />;

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setRoleError(null);
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (res) => {
          if (res.account.role !== "tenant_admin" || !res.account.tenantId) {
            setRoleError(
              "총괄관리자 계정입니다. 이 계정으로는 콘솔에 로그인할 수 없습니다 — 관리자 앱(apps/admin)을 이용하세요.",
            );
            return;
          }
          loginSession({ token: res.token, account: res.account });
        },
      },
    );
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-slate-900">Colli 콘솔</h1>
        <p className="mt-1 text-sm text-slate-500">
          테넌트 관리자 로그인 (tenant_admin 전용)
        </p>

        <label className="mt-4 block text-xs font-medium text-slate-500">
          이메일
          <input
            type="email"
            required
            autoFocus
            className={`mt-1 ${inputCls}`}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="admin@example.com"
          />
        </label>

        <label className="mt-3 block text-xs font-medium text-slate-500">
          비밀번호
          <input
            type="password"
            required
            className={`mt-1 ${inputCls}`}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </label>

        <button
          type="submit"
          disabled={login.isPending}
          className="mt-4 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {login.isPending ? "로그인 중…" : "로그인"}
        </button>

        {roleError ? (
          <p className="mt-3 text-sm text-red-600">{roleError}</p>
        ) : null}
        {!roleError && login.isError ? (
          <p className="mt-3 text-sm text-red-600">
            로그인 실패:{" "}
            {login.error instanceof Error ? login.error.message : String(login.error)}
          </p>
        ) : null}
      </form>
    </div>
  );
}
