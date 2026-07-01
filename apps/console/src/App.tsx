import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { RequireAuth } from "./components/RequireAuth";
import { LandingPage } from "./pages/LandingPage";
import { LoginPage } from "./pages/LoginPage";
import { OnboardingPage } from "./pages/OnboardingPage";
import { TenantSettingsLayout } from "./pages/TenantSettingsLayout";
import { AgentConfigPage } from "./pages/AgentConfigPage";
import { IntentsPage } from "./pages/IntentsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { getCurrentTenantId } from "./api/client";
import { useSession } from "./lib/useSession";

/**
 * 라우팅 구조 — 테넌트 셀프서비스 콘솔.
 *   /                                   콜비 공개 랜딩 페이지(로그인 불필요)
 *   /login                             tenant_admin 로그인 (fetch 모드 전용)
 *   /onboarding                        업체명/업종/070 신청 폼(로그인 불필요 — 신규 가입)
 *   /tenants/:tenantId/settings/agent   (a) 에이전트 설정 탭
 *   /tenants/:tenantId/settings/intents (b) 의도 카탈로그 탭
 *   /tenants/:tenantId/settings/tools   (c) 커스텀 Tool 탭
 *   /tenants/:tenantId/settings/kb      KB(FAQ) 탭
 *
 * fixture 모드는 RequireAuth 가 항상 통과시키고 LandingPage 도 곧장 대시보드로
 * 우회하므로 FIXTURE_TENANT_ID(BoBi) 로 바로 진입한다. fetch 모드는 로그인 후
 * 세션에 저장된 account.tenantId 가 "현재 테넌트"가 된다(getCurrentTenantId()).
 */
export function App() {
  // useSession() 을 구독해 로그인/로그아웃 시 App 이 재렌더되게 한다(fixture 모드는
  // 세션과 무관하게 항상 FIXTURE_TENANT_ID 이므로 이 훅은 구독 트리거 용도로만 쓴다).
  useSession();
  const currentTenantId = getCurrentTenantId();

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="login" element={<LoginPage />} />
      <Route path="onboarding" element={<OnboardingPage />} />
      <Route element={<RequireAuth />}>
        <Route element={<AppShell />}>
          <Route path="tenants/:tenantId/settings" element={<TenantSettingsLayout />}>
            <Route index element={<Navigate to="agent" replace />} />
            <Route path="agent" element={<AgentConfigPage />} />
            <Route path="intents" element={<IntentsPage />} />
            <Route path="tools" element={<ToolsPage />} />
            <Route path="kb" element={<KnowledgeBasePage />} />
          </Route>
          <Route
            path="*"
            element={
              <Navigate
                to={currentTenantId ? `/tenants/${currentTenantId}/settings/agent` : "/"}
                replace
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
