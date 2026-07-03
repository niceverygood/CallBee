import { afterEach, describe, expect, it, vi } from "vitest";
import { verifyToken } from "../auth/token.js";
import { makeAuthHarness, validSignupRequest } from "./auth-harness.js";

const REDIRECT_URI = "http://localhost:5175/auth/kakao/callback";

function setKakaoEnv(): void {
  process.env.KAKAO_REST_API_KEY = "test-rest-api-key";
  process.env.KAKAO_REDIRECT_URIS = REDIRECT_URI;
}

function clearKakaoEnv(): void {
  delete process.env.KAKAO_REST_API_KEY;
  delete process.env.KAKAO_CLIENT_ID;
  delete process.env.KAKAO_CLIENT_SECRET;
  delete process.env.KAKAO_REDIRECT_URIS;
  delete process.env.KAKAO_REDIRECT_URI;
  delete process.env.CONSOLE_BASE_URL;
}

function mockKakaoFetch(userInfo: unknown): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn();
  fetchMock
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: "kakao-access-token" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    )
    .mockResolvedValueOnce(
      new Response(JSON.stringify(userInfo), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  clearKakaoEnv();
  vi.unstubAllGlobals();
});

describe("POST /auth/kakao/callback", () => {
  it("카카오 이메일이 기존 tenant_admin 계정과 매칭되면 세션 토큰을 발급한다", async () => {
    setKakaoEnv();
    const h = makeAuthHarness();
    const signup = await h.signupController.signup(validSignupRequest());
    expect(signup.ok).toBe(true);
    if (!signup.ok) return;

    const fetchMock = mockKakaoFetch({
      id: 12345,
      kakao_account: { email: "OWNER@PASTA.EXAMPLE.COM" },
    });

    const res = await h.authController.kakaoLogin({
      code: "auth-code",
      redirectUri: REDIRECT_URI,
    });

    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.account.email).toBe("owner@pasta.example.com");
    expect(res.data.account.tenantId).toBe(signup.data.tenantId);
    expect(verifyToken(res.data.token)?.accountId).toBe(res.data.account.accountId);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    const tokenRequest = fetchMock.mock.calls[0]?.[1] as RequestInit | undefined;
    const tokenBody = new URLSearchParams(String(tokenRequest?.body));
    expect(tokenBody.get("client_id")).toBe("test-rest-api-key");
    expect(tokenBody.get("redirect_uri")).toBe(REDIRECT_URI);
    expect(tokenBody.get("code")).toBe("auth-code");
  });

  it("REST API key 가 없으면 kakao_not_configured 를 반환한다", async () => {
    process.env.KAKAO_REDIRECT_URIS = REDIRECT_URI;
    const h = makeAuthHarness();

    const res = await h.authController.kakaoLogin({
      code: "auth-code",
      redirectUri: REDIRECT_URI,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("kakao_not_configured");
  });

  it("허용되지 않은 redirectUri 는 invalid_params 로 거절한다", async () => {
    setKakaoEnv();
    const h = makeAuthHarness();

    const res = await h.authController.kakaoLogin({
      code: "auth-code",
      redirectUri: "http://evil.example.com/callback",
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("카카오 계정 이메일을 받지 못하면 kakao_email_required 를 반환한다", async () => {
    setKakaoEnv();
    const h = makeAuthHarness();
    mockKakaoFetch({ id: 12345, kakao_account: {} });

    const res = await h.authController.kakaoLogin({
      code: "auth-code",
      redirectUri: REDIRECT_URI,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("kakao_email_required");
  });

  it("카카오 이메일과 일치하는 계정이 없으면 kakao_account_not_found 를 반환한다", async () => {
    setKakaoEnv();
    const h = makeAuthHarness();
    mockKakaoFetch({ id: 12345, kakao_account: { email: "missing@example.com" } });

    const res = await h.authController.kakaoLogin({
      code: "auth-code",
      redirectUri: REDIRECT_URI,
    });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("kakao_account_not_found");
  });
});
