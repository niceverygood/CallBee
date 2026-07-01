/**
 * CallRepository 포트 (통화 세션/전사/녹음/동의/tool-trace 저장 추상화).
 *
 * 실제 저장은 @colli/db(Prisma)로 이뤄지나, Worker A 는 Prisma 를 직접 import 하지 않는다.
 * (프리즘 클라이언트는 `prisma generate` 전에는 존재하지 않고, 저장 로직은 통합 단계 소유.)
 * 여기서는 계약(@colli/contracts) 타입만 쓰는 순수 포트를 정의하고,
 * 테스트/데모는 인메모리 목으로 대체한다.
 *
 * 모델 shape 는 @colli/db 의 Prisma 스키마(CallSession/Transcript/ConsentRecord/
 * ToolInvocation)와 1:1 정렬한다.
 */
import type {
  CallSessionId,
  ClawOpsCallId,
  SubscriberId,
  CallDirection,
  CallOutcome,
  SpeakerRole,
  Intent,
  Emotion,
  ToolName,
} from "@colli/contracts";

// ── 통화 세션 생성/갱신 입력 ────────────────────────────────────

export interface CreateCallSessionInput {
  clawopsCallId: ClawOpsCallId;
  direction: CallDirection;
  /** 발신번호(E.164) */
  fromNumber: string;
  /** 수신 070 번호 */
  toNumber: string;
  startedAt: string; // ISO8601
}

/** 통화 진행 중/종료 시 부분 갱신 (관측성 GUARDRAIL #7 포함) */
export interface UpdateCallSessionInput {
  subscriberId?: SubscriberId | null;
  intent?: Intent;
  emotion?: Emotion;
  outcome?: CallOutcome;
  summary?: string;
  /** 실패/에러 사유 */
  failureReason?: string;
  answeredAt?: string; // ISO8601
  endedAt?: string; // ISO8601
  durationSec?: number;
  recordingUrl?: string;
}

/** 저장된 통화 세션(핸들이 되는 최소 표현) */
export interface CallSessionRecord {
  id: CallSessionId;
  clawopsCallId: ClawOpsCallId;
  direction: CallDirection;
  fromNumber: string;
  toNumber: string;
  subscriberId: SubscriberId | null;
  outcome: CallOutcome | null;
  recordingUrl: string | null;
}

// ── 전사 세그먼트 ───────────────────────────────────────────────

export interface AppendTranscriptInput {
  callSessionId: CallSessionId;
  role: SpeakerRole;
  /** Worker F 의 PII 마스킹을 거친 텍스트만 (카드/계좌/CVC 금지) */
  text: string;
  /** 세그먼트 시작 오프셋(ms) */
  startMs?: number;
}

// ── 동의 기록(고지·녹음 동의, GUARDRAIL #3) ─────────────────────

export type ConsentKind = "ai_disclosure" | "recording";

export interface RecordConsentInput {
  callSessionId: CallSessionId;
  kind: ConsentKind;
  granted: boolean;
  /** 고지 멘트 텍스트/버전(감사) */
  disclosureText?: string;
}

// ── tool 호출 trace(관측성 GUARDRAIL #7) ────────────────────────

export interface RecordToolInvocationInput {
  callSessionId: CallSessionId;
  toolName: ToolName;
  /** 마스킹된 파라미터/결과 요약만 */
  paramsSummary?: Record<string, unknown>;
  ok: boolean;
  errorCode?: string;
  latencyMs?: number;
}

// ── 포트 인터페이스 ─────────────────────────────────────────────

export interface CallRepository {
  createCallSession(input: CreateCallSessionInput): Promise<CallSessionRecord>;
  updateCallSession(
    id: CallSessionId,
    patch: UpdateCallSessionInput,
  ): Promise<CallSessionRecord>;
  findByClawopsCallId(
    clawopsCallId: ClawOpsCallId,
  ): Promise<CallSessionRecord | null>;
  appendTranscript(input: AppendTranscriptInput): Promise<void>;
  /** 녹취 URL 저장 (recording.completed 웹훅에서 호출) */
  saveRecording(
    id: CallSessionId,
    recordingUrl: string,
    durationSec: number,
  ): Promise<void>;
  recordConsent(input: RecordConsentInput): Promise<void>;
  recordToolInvocation(input: RecordToolInvocationInput): Promise<void>;
}
