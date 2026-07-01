/**
 * 접근권한 게이트 placeholder.
 * 실제 인증(SSO/세션)은 백엔드 통합 시 교체한다. 지금은 localStorage 플래그로 목킹.
 */
import { createContext, useContext, useMemo, useState } from "react";
import type { ReactNode } from "react";

const KEY = "colli-admin-auth";

interface AuthValue {
  authed: boolean;
  operator: string | null;
  login: (operator: string) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [operator, setOperator] = useState<string | null>(() =>
    typeof localStorage !== "undefined" ? localStorage.getItem(KEY) : null,
  );

  const value = useMemo<AuthValue>(
    () => ({
      authed: !!operator,
      operator,
      login: (op) => {
        localStorage.setItem(KEY, op);
        setOperator(op);
      },
      logout: () => {
        localStorage.removeItem(KEY);
        setOperator(null);
      },
    }),
    [operator],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}

export function LoginGate({ children }: { children: ReactNode }) {
  const { authed, login } = useAuth();
  const [name, setName] = useState("");

  if (authed) return <>{children}</>;

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          login(name.trim() || "operator");
        }}
        className="w-full max-w-sm rounded-xl border border-slate-200 bg-white p-6 shadow-sm"
      >
        <h1 className="text-lg font-bold text-slate-900">BoBi 고객센터 관리자</h1>
        <p className="mt-1 text-sm text-slate-500">
          운영자 로그인 (placeholder — 실제 인증은 통합 시 연결)
        </p>
        <label className="mt-4 block text-sm font-medium text-slate-700">
          운영자 이름
          <input
            className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:border-brand-500 focus:outline-none"
            placeholder="예: 운영-김"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </label>
        <button
          type="submit"
          className="mt-4 w-full rounded-lg bg-brand-600 px-3 py-2 text-sm font-semibold text-white hover:bg-brand-700"
        >
          로그인
        </button>
      </form>
    </div>
  );
}
