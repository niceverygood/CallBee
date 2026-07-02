/**
 * 승인 큐 렌더/승인/반려 플로우 테스트 (fixture 모드).
 *
 * ⚠️ fixture 테넌트 목록은 모듈 스코프 인메모리라 파일 내 테스트끼리 상태를
 * 공유한다 — 변이(승인/반려) 테스트는 읽기 전용 테스트 뒤에, 서로 다른
 * 테넌트를 대상으로 순서대로 배치한다(vitest 는 파일 내 순차 실행).
 */
import { describe, it, expect } from "vitest";
import { screen, fireEvent, within } from "@testing-library/react";
import { renderWithProviders } from "../test/render";
import { TenantsAdminPage } from "./TenantsAdminPage";

describe("TenantsAdminPage — 승인 큐", () => {
  it("승인 대기 신청을 appliedAt 오름차순으로 렌더한다(신청 정보 컬럼 포함)", async () => {
    renderWithProviders(<TenantsAdminPage />);

    // 필터 pill 에 대기 건수 표시
    expect(
      await screen.findByRole("button", { name: "신청 대기 2" }),
    ).toBeInTheDocument();

    // 오래된 신청(태호 피부과, 6/29)이 먼저
    const rows = await screen.findAllByRole("row");
    expect(rows[1]).toHaveTextContent("태호 피부과");
    expect(rows[2]).toHaveTextContent("윤정 파스타");

    // 신청 정보 컬럼: 업종/요금제/연락처/이메일
    expect(rows[1]).toHaveTextContent("병원·의원");
    expect(rows[1]).toHaveTextContent("프로");
    expect(rows[1]).toHaveTextContent("02-9876-5432");
    expect(rows[1]).toHaveTextContent("drpark@clinic.example");
  });

  it("전체 필터에서 상태 뱃지(brand 톤 라벨)와 070 미배정을 표시한다", async () => {
    renderWithProviders(<TenantsAdminPage />);
    await screen.findByRole("button", { name: "신청 대기 2" });

    fireEvent.click(screen.getByRole("button", { name: "전체" }));

    expect(await screen.findByText("BoBi")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("운영 중")).toBeInTheDocument();
    expect(within(table).getAllByText("승인 대기")).toHaveLength(2);
    // 승인 전 placeholder 번호는 "미배정"으로 표시
    expect(within(table).getAllByText("미배정")).toHaveLength(2);
    expect(within(table).getByText("+8207011112222")).toBeInTheDocument();
  });

  it("기존 테넌트+계정 직접 생성 폼이 그대로 남아있다(회귀 없음)", async () => {
    renderWithProviders(<TenantsAdminPage />);
    expect(await screen.findByText("신규 테넌트 계정 생성")).toBeInTheDocument();
    expect(screen.getByText("업체명")).toBeInTheDocument();
    expect(screen.getByText("070 번호")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "테넌트 · 관리자 계정 생성" }),
    ).toBeInTheDocument();
  });

  it("승인 모달: 형식 검증 후 070 배정 승인 → 대기 목록에서 제거 + 성공 토스트", async () => {
    renderWithProviders(<TenantsAdminPage />);
    await screen.findByRole("button", { name: "신청 대기 2" });

    // 첫 행(태호 피부과)의 승인 버튼
    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[0]!);
    expect(
      await screen.findByText("이 번호로 수신되는 전화를 AI 상담원이 받게 됩니다."),
    ).toBeInTheDocument();

    const input = screen.getByPlaceholderText("070-1234-5678");

    // 숫자/하이픈 9~13자리 형식 검증
    fireEvent.change(input, { target: { value: "abc" } });
    fireEvent.click(screen.getByRole("button", { name: "승인하기" }));
    expect(
      await screen.findByText("070 번호는 숫자와 하이픈만, 9~13자리로 입력해 주세요."),
    ).toBeInTheDocument();

    // 유효한 번호로 승인
    fireEvent.change(input, { target: { value: "070-1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: "승인하기" }));

    // 태호 피부과(hospital_clinic)는 승인 시 업종 팩이 자동 적용된다(v0.6.0)
    expect(
      await screen.findByText("승인 완료 — 070 배정됨 · 병원·의원 팩 자동 적용(문의 유형 5개)"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "신청 대기 1" }),
    ).toBeInTheDocument();
    expect(screen.queryByText("태호 피부과")).not.toBeInTheDocument();
  });

  it("승인 모달: 이미 배정된 번호는 phone_number_taken 인라인 에러", async () => {
    renderWithProviders(<TenantsAdminPage />);
    await screen.findByRole("button", { name: "신청 대기 1" });

    // 남은 대기 건(윤정 파스타)에 앞 테스트에서 배정된 번호를 재사용
    fireEvent.click(screen.getAllByRole("button", { name: "승인" })[0]!);
    const input = await screen.findByPlaceholderText("070-1234-5678");
    fireEvent.change(input, { target: { value: "070-1234-5678" } });
    fireEvent.click(screen.getByRole("button", { name: "승인하기" }));

    expect(
      await screen.findByText("이미 다른 사업장에 배정된 번호예요."),
    ).toBeInTheDocument();
    // 실패했으므로 대기 건수 유지
    expect(screen.getByRole("button", { name: "신청 대기 1" })).toBeInTheDocument();
  });

  it("반려 모달: 사유 필수 검증 → 반려 처리 + 반려됨 필터에 노출", async () => {
    renderWithProviders(<TenantsAdminPage />);
    await screen.findByRole("button", { name: "신청 대기 1" });

    fireEvent.click(screen.getAllByRole("button", { name: "반려" })[0]!);
    expect(
      await screen.findByText(
        "이 문구가 신청자에게 그대로 보여집니다. 사용자에게 보내는 문장으로 써 주세요.",
      ),
    ).toBeInTheDocument();

    // 빈 사유는 막힌다
    fireEvent.click(screen.getByRole("button", { name: "반려하기" }));
    expect(
      await screen.findByText("반려 사유를 1~500자로 입력해 주세요."),
    ).toBeInTheDocument();

    // 사유 입력 후 반려
    fireEvent.change(within(screen.getByRole("dialog")).getByRole("textbox"), {
      target: { value: "사업장 연락처로 확인이 어려워 승인하지 못했어요." },
    });
    fireEvent.click(screen.getByRole("button", { name: "반려하기" }));

    expect(
      await screen.findByText("반려 완료 — 사유가 신청자에게 표시돼요"),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole("button", { name: "신청 대기 0" }),
    ).toBeInTheDocument();
    expect(screen.getByText("승인 대기 중인 신청이 없어요.")).toBeInTheDocument();

    // 반려됨 필터로 확인
    fireEvent.click(screen.getByRole("button", { name: "반려됨" }));
    expect(await screen.findByText("윤정 파스타")).toBeInTheDocument();
    const table = screen.getByRole("table");
    expect(within(table).getByText("반려됨")).toBeInTheDocument();
  });
});
