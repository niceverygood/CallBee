import { describe, it, expect } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { TemplatePackPage } from "./TemplatePackPage";

describe("TemplatePackPage (console)", () => {
  it("업종 팩 카드 7종과 미리보기를 렌더한다", async () => {
    renderWithTenant(<TemplatePackPage />);
    // 기본 선택 팩 제목은 선택 카드와 미리보기 헤더 두 곳에 나타난다
    expect((await screen.findAllByText("식당·카페 팩")).length).toBeGreaterThan(0);
    expect(screen.getByText("병원·의원 팩")).toBeInTheDocument();
    expect(screen.getByText("부동산 팩")).toBeInTheDocument();
    // 기본 선택 팩(식당·카페)의 미리보기 — 의도/응대 수칙/KB 뱃지
    expect(await screen.findByText("이 팩 적용하기")).toBeInTheDocument();
    expect(screen.getAllByText("답변 입력 필요").length).toBeGreaterThan(0);
  });

  it("팩을 적용하면 결과 요약과 후속 링크를 보여준다", async () => {
    renderWithTenant(<TemplatePackPage />);
    const applyBtn = await screen.findByText("이 팩 적용하기");
    fireEvent.click(applyBtn);
    expect(await screen.findByText(/적용 완료/)).toBeInTheDocument();
    expect(screen.getByText("자주 묻는 질문 답변 채우러 가기")).toBeInTheDocument();
  });

  it("다른 팩 선택 시 해당 미리보기로 전환된다", async () => {
    renderWithTenant(<TemplatePackPage />);
    fireEvent.click(await screen.findByText("병원·의원 팩"));
    // 병원 팩 전용: 긴급 키워드 섹션
    expect(await screen.findByText("긴급 키워드")).toBeInTheDocument();
    expect(screen.getByText("응급")).toBeInTheDocument();
  });
});
