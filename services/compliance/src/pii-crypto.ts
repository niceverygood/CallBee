/**
 * PII 암호화 (GUARDRAIL #4: 저장 시 암호화, 최소권한).
 *
 * AES-256-GCM (node 내장 `node:crypto` 만 사용 — 외부 crypto 라이브러리 금지).
 * 키는 env `PII_ENCRYPTION_KEY` 에서 로드한다(32바이트: hex 64자 또는 base64).
 *
 * 저장 포맷(문자열): `v1:<iv_b64>:<tag_b64>:<cipher_b64>`
 * - iv 12바이트(GCM 표준), auth tag 16바이트.
 */

import {
  randomBytes,
  createCipheriv,
  createDecipheriv,
  timingSafeEqual,
} from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12; // GCM 권장 96비트
const KEY_LEN = 32; // AES-256
const VERSION = "v1";

/** 암호화 키를 env(또는 명시 문자열)에서 32바이트 Buffer 로 해석한다. */
export function resolveKey(raw?: string): Buffer {
  const src = raw ?? process.env.PII_ENCRYPTION_KEY;
  if (!src || src.length === 0) {
    throw new Error(
      "PII_ENCRYPTION_KEY 가 설정되지 않았습니다. 32바이트 hex(64자) 또는 base64 키가 필요합니다.",
    );
  }

  // hex 64자
  if (/^[0-9a-fA-F]{64}$/.test(src)) {
    return Buffer.from(src, "hex");
  }

  // base64 (32바이트로 디코딩되는 경우)
  const b64 = Buffer.from(src, "base64");
  if (b64.length === KEY_LEN) return b64;

  // utf8 원문이 정확히 32바이트인 경우 허용(개발 편의)
  const utf8 = Buffer.from(src, "utf8");
  if (utf8.length === KEY_LEN) return utf8;

  throw new Error(
    `PII_ENCRYPTION_KEY 길이가 올바르지 않습니다(32바이트 필요). hex 64자 / base64(32B) / utf8 32B 중 하나여야 합니다.`,
  );
}

/**
 * 평문을 AES-256-GCM 으로 암호화해 저장 문자열을 반환한다.
 * @param plain 평문
 * @param key   선택: 명시 키(미지정 시 env PII_ENCRYPTION_KEY)
 */
export function encryptPII(plain: string, key?: string): string {
  const k = resolveKey(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, k, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [
    VERSION,
    iv.toString("base64"),
    tag.toString("base64"),
    enc.toString("base64"),
  ].join(":");
}

/**
 * `encryptPII` 로 만든 문자열을 복호화한다. 변조/키 불일치 시 예외.
 */
export function decryptPII(cipherText: string, key?: string): string {
  const k = resolveKey(key);
  const parts = cipherText.split(":");
  if (parts.length !== 4 || parts[0] !== VERSION) {
    throw new Error("암호문 포맷이 올바르지 않습니다(v1:<iv>:<tag>:<cipher>).");
  }
  const [, ivB64, tagB64, dataB64] = parts as [string, string, string, string];
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");

  const decipher = createDecipheriv(ALGO, k, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString("utf8");
}

/**
 * 최소권한 접근 유틸: 암호화된 PII 를 복호화해 콜백에 잠깐만 노출하고,
 * 콜백이 끝나면 호출자에게 평문을 반환하지 않는다(로그/보관 최소화).
 * 반환값은 콜백의 결과물(파생값)만.
 */
export function withDecryptedPII<T>(
  cipherText: string,
  use: (plain: string) => T,
  key?: string,
): T {
  const plain = decryptPII(cipherText, key);
  try {
    return use(plain);
  } finally {
    // JS 문자열은 불변이라 명시적 wipe 는 불가하지만, 참조를 지역에 가둔다.
  }
}

/** 상수시간 비교(토큰/서명 대조용). 길이 다르면 즉시 false. */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}
