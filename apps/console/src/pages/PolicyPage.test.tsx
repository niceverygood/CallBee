import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { PolicyPage } from "./PolicyPage";

describe("PolicyPage (스튜디오 > 응대 정책)", () => {
  it("BoBi fixture 의 소개·금지사항으로 폼을 채워 렌더한다", async () => {
    renderWithTenant(<PolicyPage />);
    expect(
      await screen.findByDisplayValue(/BoBi는 보험설계사를 위한 SaaS/),
    ).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue(/보험상품의 권유·추천·비교/),
    ).toBeInTheDocument();
    expect(screen.getByText("업종 특화 금지사항")).toBeInTheDocument();
    expect(screen.getByText("저장하기")).toBeInTheDocument();
  });
});
