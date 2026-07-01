import { NavLink, Outlet } from "react-router-dom";
import { IS_FIXTURE, DEFAULT_TENANT_ID } from "../api/client";
import { TenantContext } from "../lib/tenant";
import { useTenant } from "../api/hooks";

const NAV = [
  { to: "/onboarding", label: "온보딩" },
  { to: `/tenants/${DEFAULT_TENANT_ID}/settings/agent`, label: "에이전트 설정" },
  { to: `/tenants/${DEFAULT_TENANT_ID}/settings/intents`, label: "의도 카탈로그" },
  { to: `/tenants/${DEFAULT_TENANT_ID}/settings/tools`, label: "커스텀 Tool" },
  { to: `/tenants/${DEFAULT_TENANT_ID}/settings/kb`, label: "지식베이스" },
];

export function AppShell() {
  const { data: tenant } = useTenant(DEFAULT_TENANT_ID);

  return (
    <TenantContext.Provider value={{ tenantId: DEFAULT_TENANT_ID }}>
      <div className="flex min-h-screen">
        <aside className="flex w-60 shrink-0 flex-col border-r border-slate-200 bg-white">
          <div className="px-4 py-5">
            <div className="text-base font-bold text-brand-700">Colli 콘솔</div>
            <div className="text-xs text-slate-400">
              {tenant ? tenant.name : "테넌트 셀프서비스"}
            </div>
          </div>
          <nav className="flex-1 space-y-1 px-2">
            {NAV.map((n) => (
              <NavLink
                key={n.to}
                to={n.to}
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
            {tenant ? (
              <div className="truncate">070: {tenant.phoneNumber}</div>
            ) : null}
          </div>
        </aside>
        <main className="flex-1 overflow-auto bg-slate-50 p-6">
          <Outlet />
        </main>
      </div>
    </TenantContext.Provider>
  );
}
