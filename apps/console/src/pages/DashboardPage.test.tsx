import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("070 번호 카드·체크리스트·최근 통화를 렌더한다", async () => {
    renderWithTenant(<DashboardPage />);
    expect(await screen.findByText("07052361037")).toBeInTheDocument();
    expect(screen.getByText("시작 체크리스트")).toBeInTheDocument();
    expect(screen.getByText("첫인사 멘트 정하기")).toBeInTheDocument();
    expect(await screen.findByText("최근 통화")).toBeInTheDocument();
    expect(await screen.findByText("010-****-5678")).toBeInTheDocument();
  });
});
