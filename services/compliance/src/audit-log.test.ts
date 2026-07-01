import { describe, it, expect } from "vitest";
import { InMemoryAuditLogger, sanitizeAuditEvent } from "./audit-log.js";

describe("감사 로그 — PII 마스킹", () => {
  it("message 의 카드번호를 마스킹해 기록한다", () => {
    const logger = new InMemoryAuditLogger();
    logger.record({
      type: "payment_blocked",
      severity: "critical",
      callSessionId: "call_1",
      message: "카드 4111-1111-1111-1111 수집 시도 차단",
    });
    const events = logger.all();
    expect(events).toHaveLength(1);
    expect(events[0]!.message).not.toContain("4111-1111-1111-1111");
    expect(events[0]!.message).toContain("[CARD]");
    expect(events[0]!.at).toBeInstanceOf(Date);
  });

  it("detail 문자열 값도 마스킹한다", () => {
    const safe = sanitizeAuditEvent({
      type: "pii_masked",
      severity: "info",
      detail: { raw: "계좌 110-123-456789", count: 3 },
    });
    expect(safe.detail!.raw).not.toContain("110-123-456789");
    expect(safe.detail!.raw).toContain("[ACCOUNT]");
    // 비문자열 값은 유지
    expect(safe.detail!.count).toBe(3);
  });

  it("byType 으로 이벤트를 필터한다", () => {
    const logger = new InMemoryAuditLogger();
    logger.record({ type: "consent_logged", severity: "info" });
    logger.record({ type: "tool_invoked", severity: "info" });
    logger.record({ type: "consent_logged", severity: "info" });
    expect(logger.byType("consent_logged")).toHaveLength(2);
  });
});
