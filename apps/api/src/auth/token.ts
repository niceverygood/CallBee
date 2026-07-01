/**
 * 불투명 세션 토큰 발급/검증. 새 의존성(jsonwebtoken 등) 추가 금지 — node:crypto 의
 * HMAC-SHA256 으로 직접 서명한다.
 *
 * 포맷: `base64url(JSON.stringify(payload))` + `.` + `base64url(hmac-sha256(그 payload 문자열, secret))`
 *
 * secret 은 process.env.AUTH_TOKEN_SECRET 을 사용한다. 이 환경변수가 없으면
 * 개발 편의를 위한 고정 fallback 문자열을 쓴다 — **프로덕션에서는 반드시
 * AUTH_TOKEN_SECRET 을 설정해야 한다.** 설정하지 않으면 누구나 이 저장소의
 * 소스코드만으로 유효한 토큰을 위조할 수 있다.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import type { AdminAccountId, AdminRole } from "@colli/contracts";
import type { TenantId } from "@colli/contracts";

const DEV_FALLBACK_SECRET = "colli-dev-insecure-auth-token-secret-DO-NOT-USE-IN-PROD";

function getSecret(): string {
  return process.env.AUTH_TOKEN_SECRET ?? DEV_FALLBACK_SECRET;
}

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

export interface TokenPayload {
  accountId: AdminAccountId;
  role: AdminRole;
  tenantId: TenantId | null;
  /** 발급 시각 + 7일(초, unix epoch). */
  exp: number;
}

function base64url(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function sign(payloadB64: string): string {
  return createHmac("sha256", getSecret()).update(payloadB64).digest("base64url");
}

/** accountId/role/tenantId 로 새 토큰을 발급한다(exp = 발급시각 + 7일). */
export function signToken(
  payload: Omit<TokenPayload, "exp">,
): string {
  const full: TokenPayload = {
    ...payload,
    exp: Math.floor(Date.now() / 1000) + SEVEN_DAYS_SECONDS,
  };
  const payloadB64 = base64url(JSON.stringify(full));
  const sig = sign(payloadB64);
  return `${payloadB64}.${sig}`;
}

/** 토큰을 검증한다. 서명 불일치·형식 오류·만료 시 null. */
export function verifyToken(token: string): TokenPayload | null {
  if (!token) return null;
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payloadB64, sig] = parts;
  if (!payloadB64 || !sig) return null;

  const expectedSig = sign(payloadB64);
  const sigBuf = Buffer.from(sig, "base64url");
  const expectedBuf = Buffer.from(expectedSig, "base64url");
  if (sigBuf.length !== expectedBuf.length || !timingSafeEqual(sigBuf, expectedBuf)) {
    return null;
  }

  let payload: TokenPayload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (typeof payload.exp !== "number" || payload.exp < Math.floor(Date.now() / 1000)) {
    return null;
  }

  return payload;
}
