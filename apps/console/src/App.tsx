import { Routes, Route, Navigate, useParams } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { SignupWizardPage } from "./pages/SignupWizardPage";
import { PendingApprovalPage } from "./pages/PendingApprovalPage";
import { DashboardPage } from "./pages/DashboardPage";
import { CallsPage } from "./pages/CallsPage";
import { CallDetailPage } from "./pages/CallDetailPage";
import { ProfilePage } from "./pages/ProfilePage";
import { PolicyPage } from "./pages/PolicyPage";
import { IntentsPage } from "./pages/IntentsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { TemplatePackPage } from "./pages/TemplatePackPage";
import { BusinessHoursPage } from "./pages/BusinessHoursPage";
import { CallSettingsPage } from "./pages/CallSettingsPage";
import { SmsSettingsPage } from "./pages/SmsSettingsPage";
import { BusinessInfoPage } from "./pages/BusinessInfoPage";
import { TenantContext } from "./lib/tenant";
import { Outlet } from "react-router-dom";
import { getCurrentTenantId } from "./api/client";
import { useSession } from "./lib/useSession";

/**
 * 라우팅 구조 — 콜비 사업장 콘솔 (product-spec §5 IA).
 *
 *   공개:   /            랜딩
 *           /signup      가입 위저드 3단계
 *           /login       로그인
 *   승인전: /pending     승인 대기·반려 화면(pending_approval/rejected 강제 랜딩)
 *   콘솔(로그인+active):
 *           /tenants/:id/dashboard          대시보드(기본 랜딩)
 *           /tenants/:id/calls[/:callId]    통화 기록
 *           /tenants/:id/studio/{profile,policy,intents,tools,kb}   에이전트 스튜디오
 *           /tenants/:id/settings/{hours,call,sms,business}          운영 설정
 *
 *   레거시 redirect(북마크 호환):
 *           /onboarding                     → /signup
 *           /tenants/:id/settings/agent     → studio/profile
 *           /tenants/:id/settings/intents   → studio/intents
 *           /tenants/:id/settings/tools     → studio/tools
 *           /tenants/:id/settings/kb        → studio/kb
 */

/** URL 의 :tenantId 로 TenantContext 를 스코프하는 레이아웃(구 TenantSettingsLayout 대체). */
function TenantScope() {
  const params = useParams<{ tenantId: string }>();
  const tenantId = params.tenantId ?? "";
  return (
    <TenantContext.Provider value={{ tenantId }}>
      <Outlet />
    </TenantContext.Provider>
  );
}

/** 레거시 설정 경로 → 신규 스튜디오 경로 redirect. */
function LegacyStudioRedirect({ tab }: { tab: string }) {
  const params = useParams<{ tenantId: string }>();
  return <Navigate to={`/tenants/${params.tenantId}/studio/${tab}`} replace />;
}

export function App() {
  // useSession() 을 구독해 로그인/로그아웃 시 App 이 재렌더되게 한다.
  useSession();
  const currentTenantId = getCurrentTenantId();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="signup" element={<SignupWizardPage />} />
      <Route path="onboarding" element={<Navigate to="/signup" replace />} />
      <Route path="pending" element={<PendingApprovalPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="tenants/:tenantId" element={<TenantScope />}>
            <Route index element={<Navigate to="dashboard" replace />} />
            <Route path="dashboard" element={<DashboardPage />} />
            <Route path="calls" element={<CallsPage />} />
            <Route path="calls/:callId" element={<CallDetailPage />} />
            <Route path="studio">
              <Route index element={<Navigate to="profile" replace />} />
              <Route path="pack" element={<TemplatePackPage />} />
              <Route path="profile" element={<ProfilePage />} />
              <Route path="policy" element={<PolicyPage />} />
              <Route path="intents" element={<IntentsPage />} />
              <Route path="tools" element={<ToolsPage />} />
              <Route path="kb" element={<KnowledgeBasePage />} />
            </Route>
            <Route path="settings">
              <Route index element={<Navigate to="hours" replace />} />
              <Route path="hours" element={<BusinessHoursPage />} />
              <Route path="call" element={<CallSettingsPage />} />
              <Route path="sms" element={<SmsSettingsPage />} />
              <Route path="business" element={<BusinessInfoPage />} />
              {/* 레거시 경로(구 4탭) redirect — 북마크 호환 */}
              <Route path="agent" element={<LegacyStudioRedirect tab="profile" />} />
              <Route path="intents" element={<LegacyStudioRedirect tab="intents" />} />
              <Route path="tools" element={<LegacyStudioRedirect tab="tools" />} />
              <Route path="kb" element={<LegacyStudioRedirect tab="kb" />} />
            </Route>
          </Route>
          <Route
            path="*"
            element={
              <Navigate
                to={currentTenantId ? `/tenants/${currentTenantId}/dashboard` : "/"}
                replace
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
