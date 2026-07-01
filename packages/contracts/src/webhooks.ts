/**
 * ClawOps 웹훅 이벤트 shape (단일 소스).
 * Worker A(/apps/voice)가 /voice 엔드포인트에서 수신·처리한다.
 */
import type { ClawOpsCallId } from "./domain.js";

export const CLAWOPS_EVENT_TYPES = [
  "call.initiated",
  "call.ringing",
  "call.answered",
  "call.ended",
  "recording.completed",
] as const;
export type ClawOpsEventType = (typeof CLAWOPS_EVENT_TYPES)[number];

/** 모든 이벤트 공통 봉투 */
export interface ClawOpsEventBase<
  T extends ClawOpsEventType = ClawOpsEventType,
  P = unknown,
> {
  type: T;
  callId: ClawOpsCallId;
  /** 발신번호(E.164) */
  from: string;
  /** 수신번호(070, E.164) */
  to: string;
  /** ISO8601 */
  timestamp: string;
  payload: P;
}

export interface CallInitiatedPayload {
  direction: "inbound" | "outbound";
}
export interface CallRingingPayload {
  ringingAt: string;
}
export interface CallAnsweredPayload {
  answeredAt: string;
}
export interface CallEndedPayload {
  endedAt: string;
  durationSec: number;
  reason: "completed" | "caller_hangup" | "agent_hangup" | "transfer" | "failed";
}
export interface RecordingCompletedPayload {
  /** 녹취 파일 접근 URL(서명형) */
  recordingUrl: string;
  durationSec: number;
  /** 전사 텍스트가 함께 오면 포함(없으면 별도 파이프라인) */
  transcriptText?: string;
}

export type ClawOpsEvent =
  | ClawOpsEventBase<"call.initiated", CallInitiatedPayload>
  | ClawOpsEventBase<"call.ringing", CallRingingPayload>
  | ClawOpsEventBase<"call.answered", CallAnsweredPayload>
  | ClawOpsEventBase<"call.ended", CallEndedPayload>
  | ClawOpsEventBase<"recording.completed", RecordingCompletedPayload>;

// ── Voice Agent 백엔드(구성 선택) ───────────────────────────────
export const VOICE_AGENT_MODES = ["realtime", "pipeline"] as const;
export type VoiceAgentMode = (typeof VOICE_AGENT_MODES)[number];
