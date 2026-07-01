/**
 * ClawOpsAdapter — ClawOps 전화망 능력을 감싸는 어댑터 인터페이스 (GUARDRAIL #6).
 *
 * ⚠️ 실 SDK(`@teamlearners/clawops`)는 사설 패키지라 설치돼 있지 않다.
 *    절대 import 하지 말고, 이 인터페이스 + 인메모리 목으로 대체한다.
 *    통합 단계에서 실제 SDK 어댑터를 이 인터페이스로 주입한다.
 *
 * 능력(=인바운드 세션에서 우리가 호출하는 조작):
 *   - answer / hangUp          : 응답 · 종료
 *   - startRecording           : 녹음 시작(고지·동의 후)
 *   - warmTransfer             : 상담사/영업으로 웜 트랜스퍼
 *   - sendDtmf                 : DTMF 톤 전송(ARS 연동 등)
 *   - bargeIn                  : 사용자 발화로 TTS 중단(barge-in)
 *   - playPrompt               : 안내 멘트 재생(고지/응대)
 */
import type { ClawOpsCallId, EscalationTarget } from "@colli/contracts";

export interface WarmTransferOptions {
  /** 인계 대상(영업/개발/CS 상담 큐) */
  target: EscalationTarget;
  /** 상담사에게 먼저 들려줄 컨텍스트 요약(속삭임) */
  whisperContext?: string;
}

export interface ClawOpsCapabilities {
  bargeIn: boolean;
  warmTransfer: boolean;
  dtmf: boolean;
  recording: boolean;
}

export interface ClawOpsAdapter {
  /** 이 어댑터가 지원하는 능력(테스트/구성 분기용) */
  readonly capabilities: ClawOpsCapabilities;

  /** 인바운드 콜에 응답 */
  answer(callId: ClawOpsCallId): Promise<void>;

  /** 안내/응대 멘트 재생 */
  playPrompt(callId: ClawOpsCallId, text: string): Promise<void>;

  /** 녹음 시작(고지·동의 이후에만 호출) */
  startRecording(callId: ClawOpsCallId): Promise<void>;

  /** barge-in: 진행 중인 TTS 를 사용자 발화로 중단 */
  bargeIn(callId: ClawOpsCallId): Promise<void>;

  /** DTMF 톤 전송 */
  sendDtmf(callId: ClawOpsCallId, digits: string): Promise<void>;

  /** 웜 트랜스퍼(상담사 연결 후 브리지) */
  warmTransfer(
    callId: ClawOpsCallId,
    opts: WarmTransferOptions,
  ): Promise<void>;

  /** 통화 종료 */
  hangUp(callId: ClawOpsCallId): Promise<void>;
}
