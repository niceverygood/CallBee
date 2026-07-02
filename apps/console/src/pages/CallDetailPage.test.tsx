import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { Routes, Route } from "react-router-dom";
import { renderWithTenant } from "../test/render";
import { CallDetailPage } from "./CallDetailPage";

describe("CallDetailPage", () => {
  it("통화 상세(요약/전사)를 렌더한다", async () => {
    renderWithTenant(
      <Routes>
        <Route path="/calls/:callId" element={<CallDetailPage />} />
      </Routes>,
      { route: "/calls/call_1006" },
    );
    expect(await screen.findByText("요약")).toBeInTheDocument();
    expect(
      screen.getByText(/고객 그룹 배정 방법 문의/),
    ).toBeInTheDocument();
    expect(screen.getByText("전사")).toBeInTheDocument();
    expect(
      screen.getByText("고객을 그룹으로 나누고 싶은데 어디서 하나요?"),
    ).toBeInTheDocument();
  });
});
