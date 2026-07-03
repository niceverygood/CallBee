const KAKAO_AUTHORIZE_URL = "https://kauth.kakao.com/oauth/authorize";
const STATE_STORAGE_KEY = "colli-kakao-oauth-state";
const REDIRECT_STORAGE_KEY = "colli-kakao-oauth-redirect-uri";

export interface KakaoLoginState {
  state: string | null;
  redirectUri: string;
}

export type KakaoLoginStartResult =
  | { ok: true }
  | { ok: false; message: string };

function kakaoRestApiKey(): string | null {
  return (import.meta.env.VITE_KAKAO_REST_API_KEY ?? "").trim() || null;
}

function makeState(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now().toString(36)}.${Math.random().toString(36).slice(2)}`;
}

export function getKakaoRedirectUri(): string {
  const configured = (import.meta.env.VITE_KAKAO_REDIRECT_URI ?? "").trim();
  if (configured) return configured;
  if (typeof window === "undefined") return "http://localhost:5175/auth/kakao/callback";
  return `${window.location.origin}/auth/kakao/callback`;
}

export function buildKakaoAuthorizeUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
}): string {
  const params = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    state: input.state,
    scope: "account_email",
  });
  return `${KAKAO_AUTHORIZE_URL}?${params.toString()}`;
}

export function beginKakaoLogin(): KakaoLoginStartResult {
  const clientId = kakaoRestApiKey();
  if (!clientId) {
    return {
      ok: false,
      message: "카카오 REST API 키가 아직 설정되지 않았어요.",
    };
  }
  if (typeof window === "undefined") {
    return { ok: false, message: "브라우저에서 다시 시도해 주세요." };
  }

  const state = makeState();
  const redirectUri = getKakaoRedirectUri();
  sessionStorage.setItem(STATE_STORAGE_KEY, state);
  sessionStorage.setItem(REDIRECT_STORAGE_KEY, redirectUri);
  window.location.assign(buildKakaoAuthorizeUrl({ clientId, redirectUri, state }));
  return { ok: true };
}

export function consumeKakaoLoginState(): KakaoLoginState {
  const state = sessionStorage.getItem(STATE_STORAGE_KEY);
  const redirectUri = sessionStorage.getItem(REDIRECT_STORAGE_KEY) ?? getKakaoRedirectUri();
  sessionStorage.removeItem(STATE_STORAGE_KEY);
  sessionStorage.removeItem(REDIRECT_STORAGE_KEY);
  return { state, redirectUri };
}
