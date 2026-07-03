import { describe, it, expect, beforeEach } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { resetAdminFixture } from "../api/adminApi";
import { AdminTenantsPage } from "./AdminTenantsPage";

describe("AdminTenantsPage (콘솔 통합 총괄관리자)", () => {
  beforeEach(() => resetAdminFixture());

  it("승인 큐에 fixture 대기 신청(달콤한 파스타)을 렌더한다", async () => {
    renderWithProviders(<AdminTenantsPage />);
    expect(await screen.findByRole("button", { name: "신청 대기 1" })).toBeInTheDocument();
    expect(screen.getByText("달콤한 파스타")).toBeInTheDocument();
    expect(screen.getByText("사업장 관리")).toBeInTheDocument();
    // 통합 헤더 — 총괄관리자 배지
    expect(screen.getByText("총괄관리자")).toBeInTheDocument();
  });

  it("승인 모달: 070 배정 → 업종 팩 자동 적용 토스트 + 대기 목록에서 제거", async () => {
    renderWithProviders(<AdminTenantsPage />);
    await screen.findByRole("button", { name: "신청 대기 1" });

    fireEvent.click(screen.getByRole("button", { name: "승인" }));
    expect(
      await screen.findByText("이 번호로 수신되는 전화를 AI 상담원이 받게 됩니다."),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText("070-1234-5678"), {
      target: { value: "070-2026-0703" },
    });
    fireEvent.click(screen.getByRole("button", { name: "승인하기" }));

    // 달콤한 파스타(restaurant_cafe) — 팩 자동 적용 결과가 토스트에 실린다
    expect(
      await screen.findByText(
        "승인 완료 — 070 배정됨 · 식당·카페 팩 자동 적용(문의 유형 5개)",
      ),
    ).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: "신청 대기 0" })).toBeInTheDocument();
  });

  it("반려 모달: 사유 입력 후 반려 처리", async () => {
    renderWithProviders(<AdminTenantsPage />);
    await screen.findByRole("button", { name: "신청 대기 1" });

    fireEvent.click(screen.getByRole("button", { name: "반려" }));
    fireEvent.change(
      screen.getByPlaceholderText(
        "예: 사업장 연락처로 확인이 어려워 승인하지 못했어요. 연락 가능한 번호로 문의해 주세요.",
      ),
      { target: { value: "연락처 확인이 어려워요. 문의 주세요." } },
    );
    fireEvent.click(screen.getByRole("button", { name: "반려하기" }));

    expect(
      await screen.findByText("반려 완료 — 사유가 신청자에게 표시돼요"),
    ).toBeInTheDocument();

    // 반려됨 필터에 노출
    fireEvent.click(screen.getByRole("button", { name: "반려됨" }));
    expect(await screen.findByText("달콤한 파스타")).toBeInTheDocument();
  });
});
