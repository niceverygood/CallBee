import { Routes, Route, Navigate } from "react-router-dom";
import { AppShell } from "./components/AppShell";
import { DashboardPage } from "./pages/DashboardPage";
import { CallsPage } from "./pages/CallsPage";
import { CallDetailPage } from "./pages/CallDetailPage";
import { TicketsPage } from "./pages/TicketsPage";
import { CallbacksPage } from "./pages/CallbacksPage";
import { KnowledgeBasePage } from "./pages/KnowledgeBasePage";

/**
 * 라우팅 구조.
 * 기존 BoBi 어드민 통합은 `/bobi/*` 서브라우트 자리로만 예약(범위 밖 — 통합 시 마운트).
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
        {/* 예약: 기존 BoBi 어드민 서브라우트 통합 지점
            <Route path="bobi/*" element={<BobiAdminBridge />} /> */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
  );
}
