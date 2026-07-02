import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { CallSettingsPage } from "./CallSettingsPage";

describe("CallSettingsPage (운영 설정 > 통화)", () => {
  it("호전환 번호 입력과 긴급 키워드 칩 입력을 렌더한다", async () => {
    renderWithTenant(<CallSettingsPage />);
    expect(await screen.findByText("담당자 호전환 번호")).toBeInTheDocument();
    expect(screen.getByText("긴급 키워드")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("키워드 입력 후 Enter")).toBeInTheDocument();
  });

  it("긴급 키워드를 추가하면 칩으로 표시된다", async () => {
    renderWithTenant(<CallSettingsPage />);
    const input = await screen.findByPlaceholderText("키워드 입력 후 Enter");
    fireEvent.change(input, { target: { value: "화재" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(screen.getByText("화재")).toBeInTheDocument();
  });
});
