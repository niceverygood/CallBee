import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { AgentConfigPage } from "./AgentConfigPage";

describe("AgentConfigPage", () => {
  it("BoBi 테넌트 fixture 값으로 에이전트 설정 폼을 채워 렌더한다", async () => {
    renderWithTenant(<AgentConfigPage />);
    expect(await screen.findByDisplayValue("BoBi")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("보비")).toBeInTheDocument();
    expect(screen.getByText("저장")).toBeInTheDocument();
  });
});
