/**
 * InMemoryClawOpsAdapter — ClawOpsAdapter 의 인메모리 목 구현.
 * 실 SDK 없이 세션 조작을 기록만 하고, 테스트에서 호출 순서/인자를 검증한다.
 */
import type { ClawOpsCallId } from "@colli/contracts";
import type {
  ClawOpsAdapter,
  ClawOpsCapabilities,
  WarmTransferOptions,
} from "./clawops-adapter.js";

export type ClawOpsAction =
  | { kind: "answer"; callId: ClawOpsCallId }
  | { kind: "playPrompt"; callId: ClawOpsCallId; text: string }
  | { kind: "startRecording"; callId: ClawOpsCallId }
  | { kind: "bargeIn"; callId: ClawOpsCallId }
  | { kind: "sendDtmf"; callId: ClawOpsCallId; digits: string }
  | { kind: "warmTransfer"; callId: ClawOpsCallId; opts: WarmTransferOptions }
  | { kind: "hangUp"; callId: ClawOpsCallId };

const DEFAULT_CAPS: ClawOpsCapabilities = {
  bargeIn: true,
  warmTransfer: true,
  dtmf: true,
  recording: true,
};

export class InMemoryClawOpsAdapter implements ClawOpsAdapter {
  readonly capabilities: ClawOpsCapabilities;
  /** 조작 이력(테스트 assert 용) */
  readonly actions: ClawOpsAction[] = [];

  constructor(capabilities: Partial<ClawOpsCapabilities> = {}) {
    this.capabilities = { ...DEFAULT_CAPS, ...capabilities };
  }

  async answer(callId: ClawOpsCallId): Promise<void> {
    this.actions.push({ kind: "answer", callId });
  }

  async playPrompt(callId: ClawOpsCallId, text: string): Promise<void> {
    this.actions.push({ kind: "playPrompt", callId, text });
  }

  async startRecording(callId: ClawOpsCallId): Promise<void> {
    if (!this.capabilities.recording) {
      throw new Error("recording capability disabled");
    }
    this.actions.push({ kind: "startRecording", callId });
  }

  async bargeIn(callId: ClawOpsCallId): Promise<void> {
    if (!this.capabilities.bargeIn) {
      throw new Error("bargeIn capability disabled");
    }
    this.actions.push({ kind: "bargeIn", callId });
  }

  async sendDtmf(callId: ClawOpsCallId, digits: string): Promise<void> {
    if (!this.capabilities.dtmf) {
      throw new Error("dtmf capability disabled");
    }
    this.actions.push({ kind: "sendDtmf", callId, digits });
  }

  async warmTransfer(
    callId: ClawOpsCallId,
    opts: WarmTransferOptions,
  ): Promise<void> {
    if (!this.capabilities.warmTransfer) {
      throw new Error("warmTransfer capability disabled");
    }
    this.actions.push({ kind: "warmTransfer", callId, opts });
  }

  async hangUp(callId: ClawOpsCallId): Promise<void> {
    this.actions.push({ kind: "hangUp", callId });
  }

  /** 특정 종류의 조작만 필터(테스트 편의) */
  actionsOfKind<K extends ClawOpsAction["kind"]>(
    kind: K,
  ): Extract<ClawOpsAction, { kind: K }>[] {
    return this.actions.filter(
      (a): a is Extract<ClawOpsAction, { kind: K }> => a.kind === kind,
    );
  }
}
