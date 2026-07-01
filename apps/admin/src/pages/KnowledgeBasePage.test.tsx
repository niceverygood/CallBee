import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { KnowledgeBasePage } from "./KnowledgeBasePage";

describe("KnowledgeBasePage", () => {
  it("fixture FAQ 항목을 카테고리별로 렌더한다", async () => {
    renderWithProviders(<KnowledgeBasePage />);
    expect(
      await screen.findByText("고객을 그룹으로 나누는 방법"),
    ).toBeInTheDocument();
    // 새 항목 버튼 노출
    expect(screen.getByText("+ 새 항목")).toBeInTheDocument();
  });
});
