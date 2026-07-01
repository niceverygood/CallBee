import { describe, it, expect } from "vitest";
import {
  ConsentLogger,
  InMemoryConsentRepository,
  getDisclosure,
  allDisclosures,
  DISCLOSURE_VERSION,
} from "./consent.js";
import {
  checkCallDisclosures,
  findNonCompliantCalls,
} from "./disclosure-checker.js";

describe("고지 멘트", () => {
  it("ai_disclosure / recording 문안과 버전을 반환한다", () => {
    const ai = getDisclosure("ai_disclosure");
    expect(ai.kind).toBe("ai_disclosure");
    expect(ai.text.length).toBeGreaterThan(0);
    expect(ai.version).toBe(DISCLOSURE_VERSION);
    expect(allDisclosures().map((d) => d.kind)).toEqual([
      "ai_disclosure",
      "recording",
    ]);
  });
});

describe("ConsentLogger + InMemoryConsentRepository", () => {
  it("초입 고지(AI+녹음)를 기록한다", async () => {
    const repo = new InMemoryConsentRepository();
    const logger = new ConsentLogger(repo);
    await logger.logInitialDisclosures("call_1");

    const rows = await repo.findByCallSession("call_1");
    expect(rows).toHaveLength(2);
    expect(rows.map((r) => r.kind).sort()).toEqual([
      "ai_disclosure",
      "recording",
    ]);
    expect(rows.every((r) => r.granted)).toBe(true);
    expect(rows.every((r) => (r.disclosureText ?? "").length > 0)).toBe(true);
  });

  it("명시적 거부도 기록한다", async () => {
    const repo = new InMemoryConsentRepository();
    const logger = new ConsentLogger(repo);
    await logger.logConsent({
      callSessionId: "call_2",
      kind: "recording",
      granted: false,
    });
    const rows = await repo.findByCallSession("call_2");
    expect(rows[0]!.granted).toBe(false);
  });
});

describe("checkCallDisclosures — AI기본법 checker", () => {
  it("모든 필수 고지가 granted 면 compliant", async () => {
    const repo = new InMemoryConsentRepository();
    const logger = new ConsentLogger(repo);
    await logger.logInitialDisclosures("call_ok");

    const result = await checkCallDisclosures(repo, "call_ok");
    expect(result.compliant).toBe(true);
    expect(result.missing).toHaveLength(0);
    expect(result.notGranted).toHaveLength(0);
  });

  it("고지가 없으면 missing 으로 잡는다", async () => {
    const repo = new InMemoryConsentRepository();
    const result = await checkCallDisclosures(repo, "call_empty");
    expect(result.compliant).toBe(false);
    expect(result.missing.sort()).toEqual(["ai_disclosure", "recording"]);
  });

  it("고지는 있으나 동의 거부면 notGranted 로 잡는다", async () => {
    const repo = new InMemoryConsentRepository();
    const logger = new ConsentLogger(repo);
    await logger.logDisclosure("call_x", "ai_disclosure", true);
    await logger.logConsent({
      callSessionId: "call_x",
      kind: "recording",
      granted: false,
    });
    const result = await checkCallDisclosures(repo, "call_x");
    expect(result.compliant).toBe(false);
    expect(result.notGranted).toEqual(["recording"]);
  });

  it("findNonCompliantCalls 는 비준수 통화만 반환한다", async () => {
    const repo = new InMemoryConsentRepository();
    const logger = new ConsentLogger(repo);
    await logger.logInitialDisclosures("good_call");
    // bad_call 은 아무 기록 없음

    const bad = await findNonCompliantCalls(repo, ["good_call", "bad_call"]);
    expect(bad.map((r) => r.callSessionId)).toEqual(["bad_call"]);
  });
});
