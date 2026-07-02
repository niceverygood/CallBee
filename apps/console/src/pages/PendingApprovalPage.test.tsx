import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import type { AdminAccountSummary } from "@colli/contracts";
import { renderWithProviders } from "../test/render";
import { PendingApprovalPage } from "./PendingApprovalPage";
import { DEMO_PENDING_TENANT_ID } from "../api/fixtures";
import { loginSession, logoutSession } from "../lib/session";

afterEach(() => logoutSession());

function loginAsPendingDemo() {
  const account: AdminAccountSummary = {
    accountId: "acct_demo_pending" as AdminAccountSummary["accountId"],
    email: "pending@example.com",
    role: "tenant_admin",
    tenantId: DEMO_PENDING_TENANT_ID,
    createdAt: new Date().toISOString(),
  };
  loginSession({ token: "demo-signup-token", account });
}

describe("PendingApprovalPage", () => {
  it("승인 대기 사업장이면 접수 안내와 신청 요약 카드를 렌더한다", async () => {
    loginAsPendingDemo();
    renderWithProviders(<PendingApprovalPage />);
    expect(await screen.findByText("신청이 접수됐어요")).toBeInTheDocument();
    expect(screen.getByText("달콤한 파스타")).toBeInTheDocument();
    expect(screen.getByText("승인 대기")).toBeInTheDocument();
    expect(screen.getByText("새로고침")).toBeInTheDocument();
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });
});
