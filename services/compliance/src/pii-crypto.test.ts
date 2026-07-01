import { describe, it, expect, beforeEach } from "vitest";
import {
  encryptPII,
  decryptPII,
  withDecryptedPII,
  resolveKey,
  safeEqual,
} from "./pii-crypto.js";

// 테스트용 32바이트 키(hex 64자)
const HEX_KEY =
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

describe("encryptPII / decryptPII — 라운드트립", () => {
  it("평문을 암호화 후 복호화하면 원문과 같다(명시 키)", () => {
    const plain = "홍길동 010-9999-8888";
    const cipher = encryptPII(plain, HEX_KEY);
    expect(cipher).not.toContain(plain);
    expect(cipher.startsWith("v1:")).toBe(true);
    expect(decryptPII(cipher, HEX_KEY)).toBe(plain);
  });

  it("같은 평문도 매번 다른 암호문(랜덤 IV)", () => {
    const a = encryptPII("secret", HEX_KEY);
    const b = encryptPII("secret", HEX_KEY);
    expect(a).not.toBe(b);
    expect(decryptPII(a, HEX_KEY)).toBe("secret");
    expect(decryptPII(b, HEX_KEY)).toBe("secret");
  });

  it("env PII_ENCRYPTION_KEY 로도 동작한다", () => {
    process.env.PII_ENCRYPTION_KEY = HEX_KEY;
    const cipher = encryptPII("env-key-test");
    expect(decryptPII(cipher)).toBe("env-key-test");
    delete process.env.PII_ENCRYPTION_KEY;
  });

  it("변조된 암호문은 복호화에 실패한다(GCM 무결성)", () => {
    const cipher = encryptPII("tamper-me", HEX_KEY);
    const parts = cipher.split(":");
    // cipher 본문 마지막 문자 변조
    const body = parts[3]!;
    parts[3] = body.slice(0, -1) + (body.endsWith("A") ? "B" : "A");
    expect(() => decryptPII(parts.join(":"), HEX_KEY)).toThrow();
  });

  it("잘못된 키로는 복호화에 실패한다", () => {
    const cipher = encryptPII("wrong-key", HEX_KEY);
    const otherKey =
      "ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff";
    expect(() => decryptPII(cipher, otherKey)).toThrow();
  });
});

describe("resolveKey", () => {
  it("hex 64자 키를 32바이트로 해석한다", () => {
    expect(resolveKey(HEX_KEY).length).toBe(32);
  });
  it("utf8 32바이트 키를 허용한다", () => {
    const k = "abcdefghijklmnopqrstuvwxyz123456"; // 32 chars
    expect(resolveKey(k).length).toBe(32);
  });
  it("키가 없으면 예외", () => {
    const prev = process.env.PII_ENCRYPTION_KEY;
    delete process.env.PII_ENCRYPTION_KEY;
    expect(() => resolveKey()).toThrow();
    if (prev !== undefined) process.env.PII_ENCRYPTION_KEY = prev;
  });
  it("길이가 틀린 키는 예외", () => {
    expect(() => resolveKey("tooshort")).toThrow();
  });
});

describe("withDecryptedPII — 최소권한 접근", () => {
  it("복호화된 평문을 콜백 안에서만 노출하고 파생값을 반환한다", () => {
    const cipher = encryptPII("secret-account-1234", HEX_KEY);
    const lastFour = withDecryptedPII(
      cipher,
      (plain) => plain.slice(-4),
      HEX_KEY,
    );
    expect(lastFour).toBe("1234");
  });
});

describe("safeEqual", () => {
  it("같은 문자열은 true", () => {
    expect(safeEqual("token-abc", "token-abc")).toBe(true);
  });
  it("다른 문자열/길이는 false", () => {
    expect(safeEqual("token-abc", "token-xyz")).toBe(false);
    expect(safeEqual("short", "longer-string")).toBe(false);
  });
});
