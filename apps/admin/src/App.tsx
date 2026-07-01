import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { CallsPage } from "./pages/CallsPage";
import { CallDetailPage } from "./pages/CallDetailPage";
import { TicketsPage } from "./pages/TicketsPage";
import { CallbacksPage } from "./pages/CallbacksPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";
import { TenantsAdminPage } from "./pages/TenantsAdminPage";

/**
 * 라우팅 구조.
 * 기존 BoBi(테넌트 #1) 통합 화면은 `/bobi/*` 서브라우트 자리로만 예약(범위 밖 —
 * 통합 시 마운트). `/tenants-admin` 은 콜비 총괄관리자 전용 신규 라우트로, 전체
 * 테넌트 목록 조회 + 신규 테넌트/관리자 계정 생성을 담당한다.
 */
export function App() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<DashboardPage />} />
        <Route path="calls" element={<CallsPage />} />
        <Route path="calls/:id" element={<CallDetailPage />} />
        <Route path="tickets" element={<TicketsPage />} />
        <Route path="callbacks" element={<CallbacksPage />} />
        <Route path="kb" element={<KnowledgeBasePage />} />
        <Route path="tenants-admin" element={<TenantsAdminPage />} />
        {/* 예약: 기존 BoBi 어드민 서브라우트 통합 지점
            <Route path="bobi/*" element={<BobiAdminBridge />} /> */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
