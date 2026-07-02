import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { BusinessInfoPage } from "./BusinessInfoPage";

describe("BusinessInfoPage (운영 설정 > 사업장 정보)", () => {
  it("사업장 이름·070 번호·요금제 카드를 렌더한다", async () => {
    renderWithTenant(<BusinessInfoPage />);
    expect(await screen.findByDisplayValue("BoBi")).toBeInTheDocument();
    expect(screen.getByText("07052361037")).toBeInTheDocument();
    expect(screen.getByText("엔터프라이즈")).toBeInTheDocument();
    expect(
      screen.getByText(/요금제 변경은 문의해 주세요/),
    ).toBeInTheDocument();
  });
});
