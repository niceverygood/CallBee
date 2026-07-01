import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { DashboardPage } from "./DashboardPage";

describe("DashboardPage", () => {
  it("지표 카드 라벨을 렌더한다", async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("응대율")).toBeInTheDocument();
    expect(screen.getByText("티켓 자동해결률")).toBeInTheDocument();
    expect(screen.getByText("사람 인계 수")).toBeInTheDocument();
    expect(screen.getByText("콜백 대기")).toBeInTheDocument();
  });

  it("fixture 지표 값(응대율 94%)을 표시한다", async () => {
    renderWithProviders(<DashboardPage />);
    expect(await screen.findByText("94%")).toBeInTheDocument();
  });
});
