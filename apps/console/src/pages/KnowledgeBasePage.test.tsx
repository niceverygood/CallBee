import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { KnowledgeBasePage } from "./KnowledgeBasePage";

describe("KnowledgeBasePage (console)", () => {
  it("fixture 자주 묻는 질문 항목을 분류별로 렌더한다", async () => {
    renderWithTenant(<KnowledgeBasePage />);
    expect(
      await screen.findByText("고객을 그룹으로 나누는 방법"),
    ).toBeInTheDocument();
    expect(screen.getByText("+ 질문 추가")).toBeInTheDocument();
  });
});
