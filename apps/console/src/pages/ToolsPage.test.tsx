import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { ToolsPage } from "./ToolsPage";

describe("ToolsPage", () => {
  it("fixture 커스텀 tool 목록을 렌더한다", async () => {
    renderWithTenant(<ToolsPage />);
    expect(await screen.findByText("check_reservation")).toBeInTheDocument();
    expect(screen.getByText("+ Tool 추가")).toBeInTheDocument();
  });
});
