import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { ProfilePage } from "./ProfilePage";

describe("ProfilePage (스튜디오 > 프로필)", () => {
  it("BoBi fixture 값으로 프로필 폼과 통화 미리보기를 렌더한다", async () => {
    renderWithTenant(<ProfilePage />);
    expect(await screen.findByDisplayValue("BoBi")).toBeInTheDocument();
    expect(await screen.findByDisplayValue("보비")).toBeInTheDocument();
    expect(screen.getByText("통화 미리보기")).toBeInTheDocument();
    expect(screen.getByText("보이스 선택")).toBeInTheDocument();
    expect(screen.getByText("준비 중")).toBeInTheDocument();
    expect(screen.getByText("저장하기")).toBeInTheDocument();
  });
});
