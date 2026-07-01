/**
 * InMemoryCallRepository — CallRepository 포트의 인메모리 목.
 * 실 Prisma(@colli/db) 없이 저장 호출을 배열에 기록해 테스트에서 검증한다.
 */
import type { CallSessionId, ClawOpsCallId } from "@colli/contracts";
import type {
  CallRepository,
  CallSessionRecord,
  CreateCallSessionInput,
  UpdateCallSessionInput,
  AppendTranscriptInput,
  RecordConsentInput,
  RecordToolInvocationInput,
} from "./call-repository.js";

interface StoredRecording {
  callSessionId: CallSessionId;
  recordingUrl: string;
  durationSec: number;
}

export class InMemoryCallRepository implements CallRepository {
  readonly sessions = new Map<CallSessionId, CallSessionRecord>();
  readonly transcripts: AppendTranscriptInput[] = [];
  readonly recordings: StoredRecording[] = [];
  readonly consents: RecordConsentInput[] = [];
  readonly toolInvocations: RecordToolInvocationInput[] = [];

  private seq = 0;

  async createCallSession(
    input: CreateCallSessionInput,
  ): Promise<CallSessionRecord> {
    const id = `cs_${++this.seq}` as CallSessionId;
    const record: CallSessionRecord = {
      id,
      clawopsCallId: input.clawopsCallId,
      direction: input.direction,
      fromNumber: input.fromNumber,
      toNumber: input.toNumber,
      subscriberId: null,
      outcome: null,
      recordingUrl: null,
    };
    this.sessions.set(id, record);
    return record;
  }

  async updateCallSession(
    id: CallSessionId,
    patch: UpdateCallSessionInput,
  ): Promise<CallSessionRecord> {
    const existing = this.sessions.get(id);
    if (!existing) {
      throw new Error(`call session not found: ${id}`);
    }
    if (patch.subscriberId !== undefined) {
      existing.subscriberId = patch.subscriberId;
    }
    if (patch.outcome !== undefined) existing.outcome = patch.outcome;
    if (patch.recordingUrl !== undefined) {
      existing.recordingUrl = patch.recordingUrl;
    }
    this.sessions.set(id, existing);
    return existing;
  }

  async findByClawopsCallId(
    clawopsCallId: ClawOpsCallId,
  ): Promise<CallSessionRecord | null> {
    for (const rec of this.sessions.values()) {
      if (rec.clawopsCallId === clawopsCallId) return rec;
    }
    return null;
  }

  async appendTranscript(input: AppendTranscriptInput): Promise<void> {
    this.transcripts.push(input);
  }

  async saveRecording(
    id: CallSessionId,
    recordingUrl: string,
    durationSec: number,
  ): Promise<void> {
    this.recordings.push({ callSessionId: id, recordingUrl, durationSec });
    const existing = this.sessions.get(id);
    if (existing) {
      existing.recordingUrl = recordingUrl;
      this.sessions.set(id, existing);
    }
  }

  async recordConsent(input: RecordConsentInput): Promise<void> {
    this.consents.push(input);
  }

  async recordToolInvocation(
    input: RecordToolInvocationInput,
  ): Promise<void> {
    this.toolInvocations.push(input);
  }
}
