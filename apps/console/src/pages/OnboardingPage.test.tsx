import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { OnboardingPage } from "./OnboardingPage";

describe("OnboardingPage", () => {
  it("온보딩 폼 필드와 제출 버튼을 렌더한다", () => {
    renderWithProviders(<OnboardingPage />);
    expect(screen.getByText("온보딩")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("예: 우리동네 김밥집")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("07000000000")).toBeInTheDocument();
    expect(screen.getByText("온보딩 신청")).toBeInTheDocument();
  });
});
