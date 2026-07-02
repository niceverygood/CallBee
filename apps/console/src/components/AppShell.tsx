import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { IS_FIXTURE, getCurrentTenantId } from "../api/client";
import { TenantContext } from "../lib/tenant";
import { useTenant } from "../api/hooks";
import { useSession } from "../lib/useSession";
import { logoutSession } from "../lib/session";
import { isPhoneNumberAssigned } from "@colli/contracts";
import { Logo } from "./ui";
import { Badge } from "./Badge";

interface NavItem {
  to: string;
  label: string;
}

interface NavGroup {
  title: string | null;
  items: NavItem[];
}

/**
 * 콘솔 셸 — 좌측 사이드바(w-64, product-spec §5 IA) + 본문.
 *
 * 사이드바 하단 규칙(버그 수정 반영):
 * - 세션이 있으면 **항상** 계정 이메일 + 로그아웃을 노출한다(데모 모드 포함).
 * - 데모(fixture) 모드면 "데모 모드" 뱃지(bg-brand-100 text-brand-800)를 표시한다.
 *   라이브 모드는 뱃지 없음.
 */
export function AppShell() {
  const navigate = useNavigate();
  const session = useSession();
  const tenantId = getCurrentTenantId() ?? "";
  const { data: tenant } = useTenant(tenantId);

  const base = `/tenants/${tenantId}`;
  const NAV_GROUPS: NavGroup[] = [
    {
      title: null,
      items: [
        { to: `${base}/dashboard`, label: "대시보드" },
        { to: `${base}/calls`, label: "통화 기록" },
      ],
    },
    {
      title: "에이전트 스튜디오",
      items: [
        { to: `${base}/studio/profile`, label: "프로필" },
        { to: `${base}/studio/policy`, label: "응대 정책" },
        { to: `${base}/studio/intents`, label: "문의 유형" },
        { to: `${base}/studio/tools`, label: "연동" },
        { to: `${base}/studio/kb`, label: "자주 묻는 질문" },
      ],
    },
    {
      title: "운영 설정",
      items: [
        { to: `${base}/settings/hours`, label: "영업시간" },
        { to: `${base}/settings/call`, label: "통화" },
        { to: `${base}/settings/sms`, label: "문자 안내" },
        { to: `${base}/settings/business`, label: "사업장 정보" },
      ],
    },
  ];

  const onLogout = () => {
    logoutSession();
    navigate("/login", { replace: true });
  };

  const phoneLabel = tenant
    ? isPhoneNumberAssigned(tenant.phoneNumber)
      ? tenant.phoneNumber
      : "미배정"
    : null;

  return (
    <TenantContext.Provider value={{ tenantId }}>
      <div className="flex min-h-screen">
        <aside className="flex w-64 shrink-0 flex-col border-r border-ink-200 bg-white">
          <div className="px-5 pb-4 pt-6">
            <Logo />
            <div className="mt-2 truncate text-[13px] text-ink-500">
              {tenant ? tenant.name : "사업장 콘솔"}
            </div>
          </div>
          <nav className="flex-1 space-y-5 overflow-y-auto px-3 pb-4">
            {NAV_GROUPS.map((group, gi) => (
              <div key={group.title ?? gi}>
                {group.title ? (
                  <div className="mb-1 px-3 text-xs font-semibold text-ink-400">
                    {group.title}
                  </div>
                ) : null}
                <div className="space-y-0.5">
                  {group.items.map((n) => (
                    <NavLink
                      key={n.to}
                      to={n.to}
                      className={({ isActive }) =>
                        `block rounded-lg px-3 py-2 text-sm ${
                          isActive
                            ? "bg-brand-50 font-semibold text-brand-800"
                            : "font-medium text-ink-600 hover:bg-ink-50"
                        }`
                      }
                    >
                      {n.label}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>
          <div className="border-t border-ink-200 p-4 text-xs text-ink-500">
            {IS_FIXTURE ? (
              <div className="mb-2.5">
                <Badge tone="bg-brand-100 text-brand-800">데모 모드</Badge>
              </div>
            ) : null}
            {phoneLabel ? (
              <div className="truncate">
                070 번호: <span className="font-medium text-ink-700">{phoneLabel}</span>
              </div>
            ) : null}
            {session ? (
              <div className="mt-2 truncate" title={session.account.email}>
                {session.account.email}
              </div>
            ) : null}
            {session ? (
              <button
                type="button"
                onClick={onLogout}
                className="mt-2.5 w-full rounded-lg border border-ink-200 px-2 py-1.5 text-xs font-medium text-ink-600 hover:bg-ink-50 focus:outline-none focus:ring-2 focus:ring-brand-400 focus:ring-offset-1"
              >
                로그아웃
              </button>
            ) : null}
          </div>
        </aside>
        <main className="flex-1 overflow-auto bg-ink-50 p-8">
          <Outlet />
        </main>
      </div>
    </TenantContext.Provider>
  );
}
