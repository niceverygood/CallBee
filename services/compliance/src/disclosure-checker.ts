/**
 * AI기본법 대응 훅 — 고지·동의 상태 점검 (GUARDRAIL #3).
 *
 * 모든 통화에 고지(AI 응대 + 녹음)와 동의가 기록되었는지 확인한다.
 * Worker C/E 가 통화 종료 시점/감사 배치에서 이 checker 로 결측을 탐지한다.
 */

import type { ConsentRepository, ConsentKind } from "./consent.js";

/** 모든 통화에 반드시 있어야 하는 고지 종류. */
export const REQUIRED_CONSENT_KINDS: readonly ConsentKind[] = [
  "ai_disclosure",
  "recording",
] as const;

export interface DisclosureCheckResult {
  callSessionId: string;
  /** 모든 필수 고지가 granted=true 로 기록됨 */
  compliant: boolean;
  /** 기록 자체가 없는 고지 종류 */
  missing: ConsentKind[];
  /** 기록은 있으나 granted=false 인 고지 종류 */
  notGranted: ConsentKind[];
}

/**
 * 한 통화의 고지·동의 상태를 점검한다.
 * Repository 포트를 통해 ConsentRecord 를 읽는다(인메모리 목/Prisma 어댑터 모두 동작).
 */
export async function checkCallDisclosures(
  repo: ConsentRepository,
  callSessionId: string,
): Promise<DisclosureCheckResult> {
  const records = await repo.findByCallSession(callSessionId);

  const missing: ConsentKind[] = [];
  const notGranted: ConsentKind[] = [];

  for (const kind of REQUIRED_CONSENT_KINDS) {
    const matches = records.filter((r) => r.kind === kind);
    if (matches.length === 0) {
      missing.push(kind);
    } else if (!matches.some((r) => r.granted)) {
      notGranted.push(kind);
    }
  }

  return {
    callSessionId,
    compliant: missing.length === 0 && notGranted.length === 0,
    missing,
    notGranted,
  };
}

/** 여러 통화를 일괄 점검하고 비준수 통화만 반환(감사 배치용). */
export async function findNonCompliantCalls(
  repo: ConsentRepository,
  callSessionIds: string[],
): Promise<DisclosureCheckResult[]> {
  const results = await Promise.all(
    callSessionIds.map((id) => checkCallDisclosures(repo, id)),
  );
  return results.filter((r) => !r.compliant);
}
