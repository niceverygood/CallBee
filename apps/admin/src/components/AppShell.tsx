import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../auth/AuthGate";
import { IS_FIXTURE } from "../api/client";

const NAV = [
  { to: "/", label: "대시보드", end: true },
  { to: "/calls", label: "통화" },
  { to: "/tickets", label: "티켓" },
  { to: "/callbacks", label: "콜백 큐" },
  { to: "/kb", label: "지식베이스" },
];

export function AppShell() {
  const { operator, logout } = useAuth();
  return (
    <div className="flex min-h-screen">
      <aside className="flex w-56 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="px-4 py-5">
          <div className="text-base font-bold text-brand-700">BoBi 고객센터</div>
          <div className="text-xs text-slate-400">관리자 대시보드</div>
        </div>
        <nav className="flex-1 space-y-1 px-2">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                `block rounded-lg px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "bg-brand-50 text-brand-700"
                    : "text-slate-600 hover:bg-slate-100"
                }`
              }
            >
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-slate-200 p-3 text-xs text-slate-500">
          <div className="mb-2">
            {IS_FIXTURE ? (
              <span className="inline-flex items-center rounded bg-amber-100 px-2 py-0.5 font-medium text-amber-800">
                FIXTURE 모드
              </span>
            ) : (
              <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 font-medium text-green-800">
                LIVE API
              </span>
            )}
          </div>
          <div className="mb-2 truncate">운영자: {operator}</div>
          <button
            onClick={logout}
            className="w-full rounded-lg border border-slate-300 px-2 py-1 text-slate-600 hover:bg-slate-100"
          >
            로그아웃
          </button>
        </div>
      </aside>
      <main className="flex-1 overflow-auto bg-slate-50 p-6">
        <Outlet />
      </main>
    </div>
  );
}
