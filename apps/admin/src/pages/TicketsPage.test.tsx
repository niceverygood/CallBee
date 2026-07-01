import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { TicketsPage } from "./TicketsPage";

describe("TicketsPage", () => {
  it("상태 컬럼과 fixture 티켓을 렌더한다", async () => {
    renderWithProviders(<TicketsPage />);
    // 컬럼 헤더(상태 라벨)
    expect(await screen.findByText("진행중")).toBeInTheDocument();
    expect(screen.getByText("열림")).toBeInTheDocument();
    // fixture 티켓 요약
    expect(
      screen.getByText("리포트 내보내기 실패(엑셀 다운로드 500)"),
    ).toBeInTheDocument();
  });
});
