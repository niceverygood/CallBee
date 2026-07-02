import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { CallsPage } from "./CallsPage";

describe("CallsPage", () => {
  it("통화 기록 목록(마스킹 발신번호/결과 뱃지)을 렌더한다", async () => {
    renderWithTenant(<CallsPage />);
    expect(await screen.findByText("통화 기록")).toBeInTheDocument();
    expect(await screen.findByText("010-****-5678")).toBeInTheDocument();
    expect(screen.getByText("즉시 답변")).toBeInTheDocument();
    expect(screen.getByText("콜백 예약")).toBeInTheDocument();
  });
});
