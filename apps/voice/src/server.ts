/**
 * 컴포지션 루트 — 목 어댑터/포트로 배선한 /voice express 앱.
 *
 * ⚠️ 라이브 인프라 없음(GUARDRAIL #6). 기본적으로 포트를 바인딩하지 않는다.
 *    실제 listen 은 VOICE_LISTEN=1 일 때만(로컬 수동 실행용). 테스트는 앱을 직접 호출.
 *
 * 실 어댑터(ToolClient/TenantResolverPort) 선택: `REAL_ADAPTERS=1` 환경변수가
 * 설정되면 HttpToolClient/HttpTenantResolver(apps/api 를 실제 HTTP 로 호출)를
 * 사용한다. 미설정이면 기존과 동일하게 인메모리 목을 사용한다(데모/테스트 흐름
 * 무변경). HTTP 어댑터의 apps/api 베이스 URL 은 `API_BASE_URL` 환경변수
 * (기본 `http://localhost:3001`)로 별도 지정한다. ClawOps 어댑터/Voice Agent 는
 * 이번 범위 밖 — 계속 목을 사용한다.
 */
import { InMemoryClawOpsAdapter } from "./adapters/clawops-mock.js";
import { MockVoiceAgent } from "./adapters/voice-agent-mock.js";
import { InMemoryToolClient } from "./ports/tool-client-mock.js";
import { HttpToolClient } from "./ports/tool-client-http.js";
import { InMemoryCallRepository } from "./ports/call-repository-mock.js";
import { InMemoryTenantResolver } from "./ports/tenant-resolver-mock.js";
import { HttpTenantResolver } from "./ports/tenant-resolver-http.js";
import type { ToolClient } from "./ports/tool-client.js";
import type { TenantResolverPort } from "./ports/tenant-resolver.js";
import { SessionHandler } from "./session/session-handler.js";
import { createVoiceApp } from "./webhook/voice-router.js";
import { kbAnswerScenario } from "./session/simulate.js";
import type { VoiceAgentMode } from "@colli/contracts";

/** `REAL_ADAPTERS=1` 이면 실(HTTP) 어댑터, 아니면 인메모리 목을 사용한다. */
function useRealAdapters(): boolean {
  return process.env.REAL_ADAPTERS === "1";
}

export function buildVoiceServer(mode: VoiceAgentMode = "realtime") {
  const clawops = new InMemoryClawOpsAdapter();
  // 데모 배선: 실 에이전트는 통합 단계에서 주입. 여기선 기본 KB 시나리오.
  const voiceAgent = new MockVoiceAgent(mode, kbAnswerScenario());

  const toolClient: ToolClient = useRealAdapters()
    ? new HttpToolClient()
    : new InMemoryToolClient({
        get_kb_answer: (p) => ({
          answer: `[mock] "${p.query}" 관련 안내입니다.`,
          sourceId: null,
          confidence: 0.9,
        }),
      });

  const repo = new InMemoryCallRepository();

  const tenantResolver: TenantResolverPort = useRealAdapters()
    ? new HttpTenantResolver()
    : new InMemoryTenantResolver();

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
