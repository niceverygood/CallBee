import { NavLink, Outlet, useParams } from "react-router-dom";
import { TenantContext } from "../lib/tenant";
import { useTenant } from "../api/hooks";
import { PageHeader } from "../components/PageHeader";

const TABS = [
  { to: "agent", label: "에이전트 설정" },
  { to: "intents", label: "의도 카탈로그" },
  { to: "tools", label: "커스텀 Tool" },
  { to: "kb", label: "지식베이스" },
];

/**
 * 신규 "Tenant 설정" 라우트 부모: /tenants/:id/settings/*
 * 3개 탭(에이전트 설정/의도 카탈로그/커스텀 Tool) + KB 탭을 하위 라우트로 렌더한다.
 */
export function TenantSettingsLayout() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId ?? "";
  const { data: tenant } = useTenant(tenantId);

  return (
    <TenantContext.Provider value={{ tenantId }}>
      <div>
        <PageHeader
          title="에이전트 스튜디오"
          subtitle={
            tenant
              ? `${tenant.name} · ${tenant.industryLabel ?? "업종 미지정"} · ${tenant.phoneNumber}`
              : "테넌트 설정"
          }
        />
        <div className="mb-5 flex gap-1 border-b border-slate-200">
          {TABS.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              className={({ isActive }) =>
                `-mb-px border-b-2 px-3 py-2 text-sm font-medium ${
                  isActive
                    ? "border-brand-600 text-brand-700"
                    : "border-transparent text-slate-500 hover:text-slate-700"
                }`
              }
            >
              {t.label}
            </NavLink>
          ))}
        </div>
        <Outlet />
      </div>
    </TenantContext.Provider>
  );
}
