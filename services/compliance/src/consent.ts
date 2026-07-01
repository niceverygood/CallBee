/**
 * 통화 초입 고지·동의 (GUARDRAIL #3: AI 응대 + 녹음 고지, 동의 로깅 / AI기본법·개인정보).
 *
 * - 고지 멘트(AI 응대 / 녹음) 텍스트 + 버전 생성.
 * - `ConsentLogger`: ConsentRecord 를 기록한다(Repository 포트 + 인메모리 목).
 * - kind: 'ai_disclosure' | 'recording'.
 *
 * ConsentRecord(스키마): { callSessionId, kind, granted, disclosureText, createdAt }.
 * kind 는 스키마상 String 이지만 여기서 유니온으로 좁혀 오용을 막는다.
 */

import type { CallSessionId } from "@colli/contracts";

/** 동의 종류(ConsentRecord.kind 와 정렬) */
export type ConsentKind = "ai_disclosure" | "recording";

/** 고지 멘트 버전(감사·회귀 추적용). 문안 변경 시 증가. */
export const DISCLOSURE_VERSION = "2026-07-01.v1" as const;

/** 고지 멘트 문안(한국어). 통화 초입에 재생/발화한다. */
export const DISCLOSURE_TEXTS: Record<ConsentKind, string> = {
  ai_disclosure:
    "안녕하세요, BoBi 고객센터입니다. 지금 응대는 AI 상담원이 도와드리며, 필요 시 담당자에게 연결해 드립니다.",
  recording:
    "상담 품질 향상과 정확한 처리를 위해 통화 내용이 녹음됩니다. 결제·카드 정보는 음성으로 수집하지 않으니 말씀하지 말아 주세요.",
};

export interface DisclosureScript {
  kind: ConsentKind;
  text: string;
  version: string;
}

/** kind 에 해당하는 고지 스크립트(텍스트+버전)를 반환한다. */
export function getDisclosure(kind: ConsentKind): DisclosureScript {
  return { kind, text: DISCLOSURE_TEXTS[kind], version: DISCLOSURE_VERSION };
}

/** 통화 초입에 필요한 전체 고지 스크립트(AI + 녹음) 순서대로. */
export function allDisclosures(): DisclosureScript[] {
  return [getDisclosure("ai_disclosure"), getDisclosure("recording")];
}

// ── ConsentRecord 기록 계약 ─────────────────────────────────────

/** 저장할 동의 레코드 입력(ConsentRecord 생성 payload). */
export interface ConsentRecordInput {
  callSessionId: CallSessionId | string;
  kind: ConsentKind;
  granted: boolean;
  /** 감사용 고지 멘트 원문(생략 시 표준 문안을 사용) */
  disclosureText?: string;
}

/** 저장된 동의 레코드(포트가 반환). */
export interface ConsentRecordEntity {
  id: string;
  callSessionId: string;
  kind: ConsentKind;
  granted: boolean;
  disclosureText: string | null;
  createdAt: Date;
}

/**
 * Repository 포트: 실제 저장(Prisma `ConsentRecord`)은 Worker C 가 어댑터로 구현한다.
 * Worker F 는 인터페이스 + 인메모리 목만 제공한다.
 */
export interface ConsentRepository {
  create(input: ConsentRecordInput): Promise<ConsentRecordEntity>;
  findByCallSession(callSessionId: string): Promise<ConsentRecordEntity[]>;
}

/**
 * 인메모리 목 Repository — 테스트/로컬용. 순서 보존.
 */
export class InMemoryConsentRepository implements ConsentRepository {
  private readonly rows: ConsentRecordEntity[] = [];
  private seq = 0;

  async create(input: ConsentRecordInput): Promise<ConsentRecordEntity> {
    this.seq += 1;
    const row: ConsentRecordEntity = {
      id: `consent_${this.seq}`,
      callSessionId: String(input.callSessionId),
      kind: input.kind,
      granted: input.granted,
      disclosureText:
        input.disclosureText ?? DISCLOSURE_TEXTS[input.kind] ?? null,
      createdAt: new Date(),
    };
    this.rows.push(row);
    return row;
  }

  async findByCallSession(
    callSessionId: string,
  ): Promise<ConsentRecordEntity[]> {
    return this.rows.filter((r) => r.callSessionId === callSessionId);
  }

  /** 테스트 편의: 전체 스냅샷 */
  all(): ConsentRecordEntity[] {
    return [...this.rows];
  }
}

/**
 * ConsentLogger: 고지·동의를 표준 문안/버전과 함께 기록한다.
 * Worker A/C 는 통화 초입에서 `logDisclosure(...)` / `logConsent(...)` 를 호출한다.
 */
export class ConsentLogger {
  constructor(private readonly repo: ConsentRepository) {}

  /** 고지 발화 사실을 기록(동의 여부와 무관하게 고지했음을 남김). */
  async logDisclosure(
    callSessionId: CallSessionId | string,
    kind: ConsentKind,
    granted = true,
  ): Promise<ConsentRecordEntity> {
    return this.repo.create({
      callSessionId,
      kind,
      granted,
      disclosureText: DISCLOSURE_TEXTS[kind],
    });
  }

  /** 명시적 동의/거부를 기록. */
  async logConsent(input: ConsentRecordInput): Promise<ConsentRecordEntity> {
    return this.repo.create(input);
  }

  /** 통화 초입 표준 고지(AI + 녹음)를 한 번에 기록. */
  async logInitialDisclosures(
    callSessionId: CallSessionId | string,
    granted = true,
  ): Promise<ConsentRecordEntity[]> {
    const ai = await this.logDisclosure(callSessionId, "ai_disclosure", granted);
    const rec = await this.logDisclosure(callSessionId, "recording", granted);
    return [ai, rec];
  }
}
