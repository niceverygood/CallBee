import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useLogin } from "../api/hooks";
import { beginKakaoLogin } from "../lib/kakao-login";
import { loginSession } from "../lib/session";
import { useSession } from "../lib/useSession";
import { FormField, inputCls } from "../components/FormField";
import { Logo, btnPrimary } from "../components/ui";

/**
 * 콜비 통합 로그인 화면 — 계정 역할에 따라 도착지가 갈린다.
 * - tenant_admin: 자기 사업장 대시보드(/tenants/:id/dashboard)
 * - platform_admin: 총괄관리자 화면(/admin) — 별도 관리자 앱 없이 콘솔 통합
 */
export function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [roleError, setRoleError] = useState<string | null>(null);
  const [kakaoError, setKakaoError] = useState<string | null>(null);
  const login = useLogin();
  const session = useSession();

  // 로그인 성공 시 loginSession() 이 세션 pub/sub 을 갱신 → 이 컴포넌트가
  // useSession() 구독으로 재렌더되어 여기서 역할별로 리다이렉트한다(이 라우트는
  // RequireAuth 밖에 있어 별도 처리가 필요하다).
  if (session) {
    const dest =
      session.account.role === "platform_admin"
        ? "/admin"
        : session.account.tenantId
          ? `/tenants/${session.account.tenantId}/dashboard`
          : "/";
    return <Navigate to={dest} replace />;
  }

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setRoleError(null);
    setKakaoError(null);
    login.mutate(
      { email: email.trim(), password },
      {
        onSuccess: (res) => {
          // platform_admin 도 여기서 로그인한다(→ /admin). tenant_admin 인데
          // 연결된 사업장이 없는 비정상 계정만 차단한다.
          if (res.account.role === "tenant_admin" && !res.account.tenantId) {
            setRoleError("계정에 연결된 사업장이 없어요. 콜비에 문의해 주세요.");
            return;
          }
          loginSession({ token: res.token, account: res.account });
        },
      },
    );
  };

  const onKakaoLogin = () => {
    setRoleError(null);
    setKakaoError(null);
    const result = beginKakaoLogin();
    if (!result.ok) setKakaoError(result.message);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-ink-50 p-4">
      <Link to="/" className="mb-6" aria-label="콜비 홈">
        <Logo size="lg" />
      </Link>
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm space-y-4 rounded-xl border border-ink-200 bg-white p-6 shadow-sm"
      >
        <div>
          <h1 className="text-xl font-bold text-ink-900">로그인</h1>
          <p className="mt-1 text-sm text-ink-500">사업장 콘솔에 로그인해요.</p>
        </div>

        <FormField label="이메일">
          <input
            type="email"
            required
            autoFocus
            className={inputCls}
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="owner@example.com"
          />
        </FormField>

        <FormField label="비밀번호">
          <input
            type="password"
            required
            className={inputCls}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
        </FormField>

        <button type="submit" disabled={login.isPending} className={`${btnPrimary} w-full`}>
          {login.isPending ? "로그인 중…" : "로그인"}
        </button>

        <div className="flex items-center gap-3">
          <span className="h-px flex-1 bg-ink-100" />
          <span className="text-xs font-medium text-ink-400">또는</span>
          <span className="h-px flex-1 bg-ink-100" />
        </div>

        <button
          type="button"
          onClick={onKakaoLogin}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#FEE500] px-4 py-2.5 text-sm font-semibold text-[#191919] transition hover:bg-[#f6dd00] focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1"
        >
          <span
            aria-hidden="true"
            className="flex h-5 w-5 items-center justify-center rounded-full bg-[#191919] text-[11px] font-extrabold text-[#FEE500]"
          >
            k
          </span>
          카카오로 계속하기
        </button>

        {roleError ? <p className="text-sm text-danger-600">{roleError}</p> : null}
        {kakaoError ? <p className="text-sm text-danger-600">{kakaoError}</p> : null}
        {!roleError && login.isError ? (
          <p className="text-sm text-danger-600">
            이메일 또는 비밀번호를 확인해 주세요.
          </p>
        ) : null}

        <p className="border-t border-ink-100 pt-4 text-center text-[13px] text-ink-500">
          아직 계정이 없으신가요?{" "}
          <Link to="/signup" className="font-semibold text-brand-600 hover:underline">
            무료로 시작하기
          </Link>
        </p>
      </form>
    </div>
  );
}
