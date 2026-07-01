/**
 * @colli/voice — Worker A (Telephony/Voice) 공개 표면.
 * 어댑터/포트 인터페이스와 목, 세션 핸들러, 웹훅 라우트를 재노출한다.
 * 공유 타입은 여기서 재노출하지 않는다 — 소비자는 @colli/contracts 에서 직접 import.
 */

// 어댑터 (인터페이스 + 목)
export * from "./adapters/clawops-adapter.js";
export * from "./adapters/clawops-mock.js";
export * from "./adapters/voice-agent.js";
export * from "./adapters/voice-agent-mock.js";

// 포트 (인터페이스 + 목)
export * from "./ports/tool-client.js";
export * from "./ports/tool-client-mock.js";
export * from "./ports/call-repository.js";
export * from "./ports/call-repository-mock.js";

// 세션 핸들러 + 웹훅 라우트
export * from "./session/session-handler.js";
export * from "./webhook/voice-router.js";
