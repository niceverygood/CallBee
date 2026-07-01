/**
 * 콜비 총괄관리자 로그인 게이트.
 *
 * apps/admin 은 platform_admin 전용 앱이다. 로그인 성공 응답의 account.role 이
 * "platform_admin" 이 아니면(=tenant_admin) 로그인을 취소하고, 테넌트 관리자는
 * apps/console 을 이용하라는 안내를 표시한다.
 *
 * 세션(계정 요약 + 토큰)은 localStorage 에 저장한다. fixture 모드에서는 authApi
 * 가 아무 이메일이나 목 platform_admin 계정으로 로그인시켜주므로(이메일에
 * "tenant" 가 포함되면 목 tenant_admin 계정 — 역할 거부 흐름 확인용) 실제
 * 백엔드 없이도 렌더 테스트가 계속 가능하다.
 */
import { createContext, useContext, useMemo, useState } from "react";
import type { FormEvent, ReactNode } from "react";
import type { AdminAccountSummary } from "@colli/contracts";
import { authApi, IS_FIXTURE } from "./authApi";

const ACCOUNT_KEY = "colli-admin-account";
const TOKEN_KEY = "colli-admin-token";

interface AuthValue {
  authed: boolean;
  account: AdminAccountSummary | null;
  token: string | null;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

function readStoredAccount(): AdminAccountSummary | null {
  if (typeof localStorage === "undefined") return null;
  const raw = localStorage.getItem(ACCOUNT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AdminAccountSummary;
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [account, setAccount] = useState<AdminAccountSummary | null>(readStoredAccount);
  const [token, setToken] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(TOKEN_KEY) : null,
  );

  const value = useMemo<AuthValue>(
    () => ({
      authed: !!account && !!token,
      account,
      token,
      logout: () => {
        localStorage.removeItem(ACCOUNT_KEY);
        localStorage.removeItem(TOKEN_KEY);
        setAccount(null);
        setToken(null);
      },
    }),
    [account, token],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

/** 로그인 성공 시 세션을 저장하는 헬퍼. LoginGate 에서만 사용. */
function persistSession(account: AdminAccountSummary, token: string): void {
  localStorage.setItem(ACCOUNT_KEY, JSON.stringify(account));
  localStorage.setItem(TOKEN_KEY, token);
}

export function LoginGate({ children }: { children: ReactNode }) {
  const { authed } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (authed) return <>{children}</>;

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      const res = await authApi.login({ email: email.trim(), password });
      if (res.account.role !== "platform_admin") {
        setError(
          "이 계정은 총괄관리자가 아닙니다. 테넌트 관리자는 콘솔 앱(apps/console)을 이용하세요.",
        );
        return;
      }
      persistSession(res.account, res.token);
      // AuthProvider 의 state 는 이 컴포넌트 트리 바깥(상위)에서 관리되므로,
      // localStorage 저장 후 전체 리로드로 AuthProvider 초기 state 를 다시
      // 읽게 한다(가장 단순하고 안전한 동기화 방법).
      window.location.reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : "로그인에 실패했습니다.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-slate-900">콜비 총괄관리자</h1>
        <p className="mt-1 text-sm text-slate-500">
          Colli 플랫폼 전체 테넌트를 관리하는 총괄관리자 로그인입니다.
        </p>
        {IS_FIXTURE ? (
          <p className="mt-2 rounded bg-amber-50 px-2 py-1 text-xs text-amber-700">
            FIXTURE 모드: 아무 이메일/비밀번호로 로그인하면 목 총괄관리자 계정으로
            들어갑니다. (이메일에 "tenant" 포함 시 tenant_admin 목 계정으로 거부 흐름 확인)
          </p>
        ) : null}
        <label className="mt-4 block text-sm font-medium text-slate-700">
          이메일
          <input
            type="email"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="admin@colli.example"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            autoFocus
          />
        </label>
        <label className="mt-3 block text-sm font-medium text-slate-700">
          비밀번호
          <input
            type="password"
            required
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="••••••••"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
        <button
          type="submit"
          disabled={submitting}
          className="mt-4 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700 disabled:opacity-50"
        >
          {submitting ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </div>
  );
}
