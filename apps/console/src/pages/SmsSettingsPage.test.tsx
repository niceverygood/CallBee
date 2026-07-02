import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { SmsSettingsPage } from "./SmsSettingsPage";

describe("SmsSettingsPage (운영 설정 > 문자 안내)", () => {
  it("준비 중 배너와 토글 3쌍을 렌더한다", async () => {
    renderWithTenant(<SmsSettingsPage />);
    expect(
      await screen.findByText(/문자 자동 발송은 준비 중이에요/),
    ).toBeInTheDocument();
    expect(screen.getByText("접수 확인 문자")).toBeInTheDocument();
    expect(screen.getByText("콜백 예약 안내 문자")).toBeInTheDocument();
    expect(screen.getByText("부재중(영업시간 외) 안내 문자")).toBeInTheDocument();
  });
});
