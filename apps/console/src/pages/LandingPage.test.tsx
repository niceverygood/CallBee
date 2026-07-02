import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { LandingPage } from "./LandingPage";

describe("LandingPage", () => {
  it("브랜드 히어로 카피와 요금제 4카드를 렌더한다", () => {
    renderWithProviders(<LandingPage />);
    expect(screen.getByRole("heading", { level: 1, name: "콜비" })).toBeInTheDocument();
    expect(screen.getByText("AI 전화 응대 플랫폼")).toBeInTheDocument();
    expect(screen.getAllByText("무료로 시작하기").length).toBeGreaterThan(0);
    expect(screen.getByText("무료 체험")).toBeInTheDocument();
    expect(screen.getByText("스타터")).toBeInTheDocument();
    expect(screen.getByText("프로")).toBeInTheDocument();
    expect(screen.getByText("엔터프라이즈")).toBeInTheDocument();
    expect(screen.getByText("다음 전화부터, 콜비가 받을게요")).toBeInTheDocument();
  });
});
