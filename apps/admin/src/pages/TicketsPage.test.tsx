import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { TicketsPage } from "./TicketsPage";

describe("TicketsPage", () => {
  it("보드 제목과 fixture 티켓을 렌더한다", async () => {
    renderWithProviders(<TicketsPage />);
    // fixture 티켓 요약(고유 텍스트)이 로드된다
    expect(
      await screen.findByText("리포트 내보내기 실패(엑셀 다운로드 500)"),
    ).toBeInTheDocument();
    expect(screen.getByText("세금계산서 재발행 요청")).toBeInTheDocument();
    // 상태 라벨은 컬럼 헤더 + select option 으로 여러 번 등장한다
    expect(screen.getAllByText("진행중").length).toBeGreaterThan(0);
  });
});
