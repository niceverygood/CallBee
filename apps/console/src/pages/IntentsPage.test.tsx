import { describe, it, expect } from "vitest";
import { screen } from "@testing-library/react";
import { renderWithTenant } from "../test/render";
import { IntentsPage } from "./IntentsPage";

describe("IntentsPage", () => {
  it("BoBi 기본 의도 카탈로그(7종)를 테이블로 렌더한다", async () => {
    renderWithTenant(<IntentsPage />);
    expect(await screen.findByText("사용법")).toBeInTheDocument();
    expect(screen.getByText("billing")).toBeInTheDocument();
    expect(screen.getByText("+ 의도 추가")).toBeInTheDocument();
  });
});
