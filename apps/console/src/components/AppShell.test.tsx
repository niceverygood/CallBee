import { describe, it, expect, afterEach } from "vitest";
import { screen } from "@testing-library/react";
import type { AdminAccountSummary } from "@colli/contracts";
import { renderWithProviders } from "../test/render";
import { AppShell } from "./AppShell";
import { FIXTURE_TENANT_ID } from "../api/client";
import { loginSession, logoutSession } from "../lib/session";

afterEach(() => logoutSession());

describe("AppShell (사이드바)", () => {
  it("데모 모드 뱃지와 IA 그룹(대시보드/스튜디오/운영 설정)을 렌더한다", () => {
    renderWithProviders(<AppShell />);
    expect(screen.getByText("데모 모드")).toBeInTheDocument();
    expect(screen.getByText("대시보드")).toBeInTheDocument();
    expect(screen.getByText("통화 기록")).toBeInTheDocument();
    expect(screen.getByText("에이전트 스튜디오")).toBeInTheDocument();
    expect(screen.getByText("문의 유형")).toBeInTheDocument();
    expect(screen.getByText("운영 설정")).toBeInTheDocument();
    expect(screen.getByText("영업시간")).toBeInTheDocument();
  });

  it("세션이 있으면 데모 모드여도 계정 이메일과 로그아웃을 항상 노출한다", () => {
    const account: AdminAccountSummary = {
      accountId: "acct_bobi" as AdminAccountSummary["accountId"],
      email: "owner@bobi.example",
      role: "tenant_admin",
      tenantId: FIXTURE_TENANT_ID as AdminAccountSummary["tenantId"],
      createdAt: new Date().toISOString(),
    };
    loginSession({ token: "demo-token", account });
    renderWithProviders(<AppShell />);
    expect(screen.getByText("데모 모드")).toBeInTheDocument();
    expect(screen.getByText("owner@bobi.example")).toBeInTheDocument();
    expect(screen.getByText("로그아웃")).toBeInTheDocument();
  });
});
