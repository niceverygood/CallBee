import { describe, expect, it } from "vitest";
import { api, IS_FIXTURE } from "./client";

describe("스토어 데모 로그인", () => {
  it("심사 계정을 BoBi 샘플 테넌트 세션으로 연결한다", async () => {
    expect(IS_FIXTURE).toBe(true);

    const result = await api.login({
      email: "review@callbee.im",
      password: "Callbee2026!",
    });

    expect(result.account.email).toBe("review@callbee.im");
    expect(result.account.role).toBe("tenant_admin");
    expect(result.account.tenantId).toBeTruthy();
    expect(result.token).toBe("demo-review-token");
  });
});
