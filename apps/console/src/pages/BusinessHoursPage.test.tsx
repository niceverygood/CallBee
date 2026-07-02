import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { BusinessHoursPage } from "./BusinessHoursPage";

describe("BusinessHoursPage (운영 설정 > 영업시간)", () => {
  it("미설정(24시간 응대) 상태와 '지금 전화가 오면?' 미리보기를 렌더한다", async () => {
    renderWithTenant(<BusinessHoursPage />);
    expect(await screen.findByText("요일별 영업시간")).toBeInTheDocument();
    expect(screen.getByText("지금 전화가 오면?")).toBeInTheDocument();
    expect(screen.getByText("24시간 응대")).toBeInTheDocument();
    expect(screen.getByText("영업시간 외 응대 방식")).toBeInTheDocument();
  });

  it("영업시간 사용을 켜면 요일 그리드(월~일)가 나타난다", async () => {
    renderWithTenant(<BusinessHoursPage />);
    const toggle = await screen.findByLabelText("영업시간 사용");
    fireEvent.click(toggle);
    expect(screen.getByText("월")).toBeInTheDocument();
    expect(screen.getByText("일")).toBeInTheDocument();
    expect(screen.getByText("월요일 시간을 평일에 일괄 적용")).toBeInTheDocument();
  });
});
