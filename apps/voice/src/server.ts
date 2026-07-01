/**
 * 컴포지션 루트 — 목 어댑터/포트로 배선한 /voice express 앱.
 *
 * ⚠️ 라이브 인프라 없음(GUARDRAIL #6). 기본적으로 포트를 바인딩하지 않는다.
 *    실제 listen 은 VOICE_LISTEN=1 일 때만(로컬 수동 실행용). 테스트는 앱을 직접 호출.
 *    통합 단계에서 목 대신 실 어댑터(ClawOps SDK, Worker C HTTP, @colli/db)를 주입한다.
 */
import { InMemoryClawOpsAdapter } from "./adapters/clawops-mock.js";
import { MockVoiceAgent } from "./adapters/voice-agent-mock.js";
import { InMemoryToolClient } from "./ports/tool-client-mock.js";
import { InMemoryCallRepository } from "./ports/call-repository-mock.js";
import { InMemoryTenantResolver } from "./ports/tenant-resolver-mock.js";
import { SessionHandler } from "./session/session-handler.js";
import { createVoiceApp } from "./webhook/voice-router.js";
import { kbAnswerScenario } from "./session/simulate.js";
import type { VoiceAgentMode } from "@colli/contracts";

export function buildVoiceServer(mode: VoiceAgentMode = "realtime") {
  const clawops = new InMemoryClawOpsAdapter();
  // 데모 배선: 실 에이전트는 통합 단계에서 주입. 여기선 기본 KB 시나리오.
  const voiceAgent = new MockVoiceAgent(mode, kbAnswerScenario());
  const toolClient = new InMemoryToolClient({
    get_kb_answer: (p) => ({
      answer: `[mock] "${p.query}" 관련 안내입니다.`,
      sourceId: null,
      confidence: 0.9,
    }),
  });
  const repo = new InMemoryCallRepository();
  // 실 조회는 통합 단계에서 GET /tenants/resolve HTTP 어댑터로 교체(Worker C 구현).
  const tenantResolver = new InMemoryTenantResolver();
  const handler = new SessionHandler({
    clawops,
    voiceAgent,
    toolClient,
    repo,
    tenantResolver,
  });
  const app = createVoiceApp({ handler });
  return { app, handler, clawops, toolClient, repo, tenantResolver };
}

// 수동 로컬 실행(VOICE_LISTEN=1)에서만 포트 바인딩.
if (process.env.VOICE_LISTEN === "1") {
  const port = Number(process.env.PORT ?? 3001);
  const { app } = buildVoiceServer();
  app.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`[@colli/voice] /voice webhook listening on :${port}`);
  });
}
