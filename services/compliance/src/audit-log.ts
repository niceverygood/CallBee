/**
 * 감사 로그 인터페이스 (GUARDRAIL #7: 관측성 + 규제 대응).
 *
 * 규제·보안 관점의 감사 이벤트를 남긴다. 실제 싱크(DB/파일/외부 SIEM)는
 * 각 트랙이 어댑터로 구현한다. Worker F 는 포트 + 인메모리 목만 제공한다.
 *
 * 중요: 감사 로그에 PII/결제정보가 절대 들어가지 않도록, 기록 전에 메시지를
 * maskPII 로 강제 통과시킨다(detail 값의 문자열도 마스킹).
 */

import { maskPII } from "./pii-mask.js";

/** 감사 이벤트 종류(규제·보안 횡단). */
export type AuditEventType =
  | "consent_logged" // 고지·동의 기록
  | "disclosure_missing" // 고지 결측 탐지
  | "verification_denied" // 본인확인 실패로 접근 차단
  | "payment_blocked" // 결제정보 음성수집 차단
  | "pii_masked" // 전사/로그에서 PII 마스킹 발생
  | "pii_encrypted" // PII 암호화 저장
  | "tool_invoked"; // 상태 변경 tool 호출

export type AuditSeverity = "info" | "warn" | "critical";

export interface AuditEvent {
  type: AuditEventType;
  severity: AuditSeverity;
  callSessionId?: string;
  /** 자유 텍스트 메시지(마스킹 대상) */
  message?: string;
  /** 부가 데이터(문자열 값은 마스킹됨) */
  detail?: Record<string, unknown>;
  at: Date;
}

/** 감사 이벤트 입력(at 은 로거가 채운다). */
export type AuditEventInput = Omit<AuditEvent, "at">;

/** 감사 로거 포트. 실제 싱크는 어댑터로 구현. */
export interface AuditLogger {
  record(event: AuditEventInput): void;
}

/** detail 안의 문자열 값들을 재귀적으로 마스킹한다(얕은 깊이). */
function maskDetail(
  detail: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!detail) return detail;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(detail)) {
    out[k] = typeof v === "string" ? maskPII(v).masked : v;
  }
  return out;
}

/** 이벤트 전체에 PII 마스킹을 적용한다(message + detail). */
export function sanitizeAuditEvent(event: AuditEventInput): AuditEventInput {
  return {
    ...event,
    message: event.message ? maskPII(event.message).masked : event.message,
    detail: maskDetail(event.detail),
  };
}

/**
 * 인메모리 감사 로거 — 테스트/로컬용. 기록 전 자동 마스킹.
 */
export class InMemoryAuditLogger implements AuditLogger {
  private readonly events: AuditEvent[] = [];

  record(event: AuditEventInput): void {
    const safe = sanitizeAuditEvent(event);
    this.events.push({ ...safe, at: new Date() });
  }

  all(): AuditEvent[] {
    return [...this.events];
  }

  byType(type: AuditEventType): AuditEvent[] {
    return this.events.filter((e) => e.type === type);
  }

  clear(): void {
    this.events.length = 0;
  }
}
