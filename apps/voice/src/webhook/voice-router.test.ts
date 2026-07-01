import { describe, it, expect } from "vitest";
import type { ClawOpsCallId } from "@colli/contracts";
import { parseClawOpsEvent, createVoiceApp } from "./voice-router.js";
import { SessionHandler } from "../session/session-handler.js";
import { InMemoryClawOpsAdapter } from "../adapters/clawops-mock.js";
import { MockVoiceAgent } from "../adapters/voice-agent-mock.js";
import { InMemoryToolClient } from "../ports/tool-client-mock.js";
import { InMemoryCallRepository } from "../ports/call-repository-mock.js";
import {
  BOBI_PHONE_NUMBER,
  InMemoryTenantResolver,
} from "../ports/tenant-resolver-mock.js";
import { kbAnswerScenario, buildInboundEventSequence } from "../session/simulate.js";

describe("parseClawOpsEvent", () => {
  it("유효한 이벤트를 파싱한다", () => {
    const ev = parseClawOpsEvent({
      type: "call.initiated",
      callId: "c1",
      from: "+821011112222",
      to: "+827012340000",
      timestamp: "2026-07-01T09:00:00.000Z",
      payload: { direction: "inbound" },
    });
    expect(ev).not.toBeNull();
    expect(ev?.type).toBe("call.initiated");
  });

  it("알 수 없는 type 은 null", () => {
    expect(
      parseClawOpsEvent({
        type: "call.bogus",
        callId: "c1",
        from: "a",
        to: "b",
        timestamp: "t",
        payload: {},
      }),
    ).toBeNull();
  });

  it("필수 필드 누락은 null", () => {
    expect(parseClawOpsEvent({ type: "call.ended" })).toBeNull();
    expect(parseClawOpsEvent(null)).toBeNull();
    expect(parseClawOpsEvent("nope")).toBeNull();
  });
});

describe("/voice 라우트 (express app, 포트 바인딩 없이 핸들러 직접 주입)", () => {
  function makeApp() {
    const clawops = new InMemoryClawOpsAdapter();
    const voiceAgent = new MockVoiceAgent("realtime", kbAnswerScenario());
    const toolClient = new InMemoryToolClient({
      get_kb_answer: () => ({ answer: "ok", sourceId: null, confidence: 0.9 }),
    });
    const repo = new InMemoryCallRepository();
    const tenantResolver = new InMemoryTenantResolver();
    const handler = new SessionHandler({
      clawops,
      voiceAgent,
      toolClient,
      repo,
      tenantResolver,
    });
    const app = createVoiceApp({ handler });
    return { app, handler, repo, clawops };
  }

  it("웹훅 이벤트 시퀀스를 라우트로 흘려보내면 세션이 왕복한다", async () => {
    const { app, repo, clawops } = makeApp();
    const events = buildInboundEventSequence({
      callId: "c_route_1" as ClawOpsCallId,
      from: "+821011112222",
      to: BOBI_PHONE_NUMBER,
      recordingUrl: "https://rec.example/c_route_1.wav",
    });

    // express 앱을 직접 호출하기 위한 초경량 request/response 목.
    for (const ev of events) {
      const status = await postVoice(app, ev);
      expect(status).toBe(200);
    }

    // 라우트를 통해도 tool 위임 + 녹음 저장이 일어남
    expect(repo.recordings).toHaveLength(1);
    expect(clawops.actionsOfKind("hangUp")).toHaveLength(1);
  });

  it("잘못된 바디는 400", async () => {
    const { app } = makeApp();
    const status = await postVoice(app, { type: "nope" });
    expect(status).toBe(400);
  });
});

/**
 * express 앱을 실제 포트 바인딩 없이 호출하는 테스트 헬퍼.
 * app.handle(req,res) 로 in-process 디스패치하고 상태코드를 캡처한다.
 */
type HandleFn = (
  req: unknown,
  res: unknown,
  next: (err?: unknown) => void,
) => void;

function postVoice(
  app: ReturnType<typeof createVoiceApp>,
  body: unknown,
): Promise<number> {
  const handle = (app as unknown as { handle: HandleFn }).handle.bind(app);
  return new Promise((resolve, reject) => {
    const req = {
      method: "POST",
      url: "/voice",
      headers: { "content-type": "application/json" },
      // _body:true 로 표시하면 express.json() 이 이미 파싱된 것으로 보고 건너뛴다.
      _body: true,
      body,
    };

    let statusCode = 200;
    const res = {
      statusCode: 200,
      status(code: number) {
        statusCode = code;
        this.statusCode = code;
        return this;
      },
      json(_payload: unknown) {
        resolve(statusCode);
        return this;
      },
      setHeader() {
        return this;
      },
      end() {
        resolve(statusCode);
        return this;
      },
    };

    try {
      handle(req, res, (err?: unknown) => {
        if (err) reject(err);
        else resolve(statusCode);
      });
    } catch (e) {
      reject(e);
    }
  });
}
