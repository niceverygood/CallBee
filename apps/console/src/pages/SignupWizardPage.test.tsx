import { describe, it, expect, afterEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { SignupWizardPage } from "./SignupWizardPage";
import { logoutSession } from "../lib/session";

afterEach(() => logoutSession());

describe("SignupWizardPage", () => {
  it("1단계(계정 만들기) 필드와 스텝퍼를 렌더한다", () => {
    renderWithProviders(<SignupWizardPage />);
    expect(screen.getByText("계정을 만들어 주세요")).toBeInTheDocument();
    expect(screen.getByText("계정 만들기")).toBeInTheDocument();
    expect(screen.getByText("사업장 정보")).toBeInTheDocument();
    expect(screen.getByText("요금제 선택")).toBeInTheDocument();
    expect(screen.getByPlaceholderText("owner@example.com")).toBeInTheDocument();
  });

  it("이메일 형식이 틀리면 스펙 문구로 인라인 에러를 보여준다", () => {
    renderWithProviders(<SignupWizardPage />);
    fireEvent.change(screen.getByPlaceholderText("owner@example.com"), {
      target: { value: "not-an-email" },
    });
    fireEvent.click(screen.getByText("다음"));
    expect(screen.getByText("이메일 형식을 확인해 주세요")).toBeInTheDocument();
  });

  it("검증을 통과하면 2단계(업종 프리셋 카드 8종)로 진행한다", () => {
    renderWithProviders(<SignupWizardPage />);
    fireEvent.change(screen.getByPlaceholderText("owner@example.com"), {
      target: { value: "owner@example.com" },
    });
    const pwInputs = screen.getAllByPlaceholderText("••••••••");
    fireEvent.change(pwInputs[0]!, { target: { value: "password1" } });
    fireEvent.change(pwInputs[1]!, { target: { value: "password1" } });
    fireEvent.click(screen.getByText("다음"));
    expect(screen.getByText("사업장을 알려주세요")).toBeInTheDocument();
    expect(screen.getByText("식당·카페")).toBeInTheDocument();
    expect(screen.getByText("병원·의원")).toBeInTheDocument();
    expect(screen.getByText("기타")).toBeInTheDocument();
  });
});
