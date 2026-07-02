import { useState } from "react";
import type { FormEvent } from "react";
import { Link, Navigate } from "react-router-dom";
import { useLogin } from "../api/hooks";
import { loginSession } from "../lib/session";
import { useSession } from "../lib/useSession";
import { FormField, inputCls } from "../components/FormField";
import { Logo, btnPrimary } from "../components/ui";

/**
 * 콘솔(사업장 관리자) 전용 로그인 화면.
 * 총괄관리자(platform_admin) 계정으로 로그인을 시도하면 거부하고 관리자 앱을
 * 안내한다(역할 스왑 방지 — apps/admin 은 반대로 tenant_admin 을 거부한다).
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
              "총괄관리자 계정이에요. 이 계정은 관리자 앱에서 로그인해 주세요.",
            );
            return;
          }
          loginSession({ token: res.token, account: res.account });
        },
      },
    );
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

        {roleError ? <p className="text-sm text-danger-600">{roleError}</p> : null}
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
