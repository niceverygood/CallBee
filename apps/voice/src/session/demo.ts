/**
 * 로컬 데모 스크립트 (managed inbound 시뮬레이션).
 * 실행: `pnpm --filter @colli/voice demo` (라이브 인프라 없이 목으로 왕복 출력)
 *
 * 흐름을 콘솔에 찍어 수신→응대→tool 1회→transfer/hangup 왕복과
 * 녹음/전사/동의/trace 저장을 눈으로 확인한다.
 */
import type { ToolResult } from "@colli/contracts";
import {
  simulateInboundCall,
  kbAnswerScenario,
  salesTransferScenario,
} from "./simulate.js";

/* eslint-disable no-console */
async function runKbDemo(): Promise<void> {
  console.log("\n=== DEMO 1: KB 답변 후 hang_up (realtime) ===");
  const { clawops, toolClient, repo } = await simulateInboundCall({
    mode: "realtime",
    scenario: kbAnswerScenario(),
    toolHandlers: {
      get_kb_answer: (p): ToolResult<"get_kb_answer"> => ({
        answer: `"${p.query}" → 설정 > 리포트 > 내보내기`,
        sourceId: null,
        confidence: 0.93,
      }),
    },
    transcriptText: "리포트 내보내기가 어디 있나요?",
  });

  console.log("ClawOps actions:", clawops.actions.map((a) => a.kind).join(" → "));
  console.log("tool invocations:", toolClient.invocations.map((i) => i.tool));
  console.log("transcripts:", repo.transcripts.length, "segments");
  console.log("consents:", repo.consents.map((c) => c.kind));
  console.log("recordings:", repo.recordings.length);
  console.log("tool traces:", repo.toolInvocations.map((t) => `${t.toolName}:${t.ok}`));
  console.log("outcome:", [...repo.sessions.values()][0]?.outcome);
}

async function runSalesDemo(): Promise<void> {
  console.log("\n=== DEMO 2: 해지 → route_to_sales → warm_transfer (pipeline) ===");
  const { clawops, toolClient, repo } = await simulateInboundCall({
    mode: "pipeline",
    scenario: salesTransferScenario("sub_123"),
    toolHandlers: {
      route_to_sales: (): ToolResult<"route_to_sales"> => ({
        routed: true,
        mode: "warm_transfer",
      }),
    },
  });

  console.log("ClawOps actions:", clawops.actions.map((a) => a.kind).join(" → "));
  console.log("tool invocations:", toolClient.invocations.map((i) => i.tool));
  const wt = clawops.actionsOfKind("warmTransfer")[0];
  console.log("warm transfer target:", wt?.opts.target);
  console.log("recordings:", repo.recordings.length);
  console.log("outcome:", [...repo.sessions.values()][0]?.outcome);
}

async function main(): Promise<void> {
  await runKbDemo();
  await runSalesDemo();
  console.log("\n데모 완료 — 두 통화 모두 왕복 통과.");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
