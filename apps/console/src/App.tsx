import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { OnboardingPage } from "./pages/OnboardingPage";
import { TenantSettingsLayout } from "./pages/TenantSettingsLayout";
import { AgentConfigPage } from "./pages/AgentConfigPage";
import { IntentsPage } from "./pages/IntentsPage";
import { ToolsPage } from "./pages/ToolsPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { DEFAULT_TENANT_ID } from "./api/client";

/**
 * 라우팅 구조 — 테넌트 셀프서비스 콘솔.
 *   /onboarding                        업체명/업종/070 신청 폼
 *   /tenants/:tenantId/settings/agent   (a) 에이전트 설정 탭
 *   /tenants/:tenantId/settings/intents (b) 의도 카탈로그 탭
 *   /tenants/:tenantId/settings/tools   (c) 커스텀 Tool 탭
 *   /tenants/:tenantId/settings/kb      KB(FAQ) 탭
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/onboarding" replace />} />
        <Route path="onboarding" element={<OnboardingPage />} />
        <Route path="tenants/:tenantId/settings" element={<TenantSettingsLayout />}>
          <Route index element={<Navigate to="agent" replace />} />
          <Route path="agent" element={<AgentConfigPage />} />
          <Route path="intents" element={<IntentsPage />} />
          <Route path="tools" element={<ToolsPage />} />
          <Route path="kb" element={<KnowledgeBasePage />} />
        </Route>
        <Route
          path="*"
          element={<Navigate to={`/tenants/${DEFAULT_TENANT_ID}/settings/agent`} replace />}
        />
      </Route>
    </Routes>
  );
}
