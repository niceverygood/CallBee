/**
 * 관리자 계정 비밀번호 해시/검증. node:crypto 의 scrypt 만 사용(외부 라이브러리 금지).
 *
 * ⚠️ 이 포맷은 이미 라이브 Supabase 에 시딩된 platform_admin 계정과 정확히
 * 호환되어야 한다 — 절대 변경하지 말 것.
 * 포맷: `scrypt:<salt-hex>:<hash-hex>` (hash 는 scryptSync(password, salt, 64)).
 */
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

/** 신규 계정 생성 시 평문 비밀번호를 저장 가능한 해시 문자열로 변환한다. */
export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/** 로그인 시 평문 비밀번호와 저장된 해시 문자열을 타이밍 안전하게 비교한다. */
export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, salt, hashHex] = stored.split(":");
  if (scheme !== "scrypt" || !salt || !hashHex) return false;
  const hash = scryptSync(password, salt, 64);
  const stored2 = Buffer.from(hashHex, "hex");
  return hash.length === stored2.length && timingSafeEqual(hash, stored2);
}
