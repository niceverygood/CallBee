/**
 * /voice 웹훅 라우트 (express).
 * ClawOps 가 POST 하는 `ClawOpsEvent`(call.* · recording.completed)를 수신해
 * SessionHandler 로 위임한다. 타입/이벤트 종류는 계약(@colli/contracts)에서만.
 */
import express, { type Express, type Request, type Response } from "express";
import {
  CLAWOPS_EVENT_TYPES,
  type ClawOpsEvent,
  type ClawOpsEventType,
} from "@colli/contracts";
import type { SessionHandler } from "../session/session-handler.js";

/** 웹훅 바디가 최소한의 ClawOpsEvent shape 인지 런타임 검증 */
export function parseClawOpsEvent(body: unknown): ClawOpsEvent | null {
  if (typeof body !== "object" || body === null) return null;
  const b = body as Record<string, unknown>;
  const type = b.type;
  if (
    typeof type !== "string" ||
    !CLAWOPS_EVENT_TYPES.includes(type as ClawOpsEventType)
  ) {
    return null;
  }
  if (
    typeof b.callId !== "string" ||
    typeof b.from !== "string" ||
    typeof b.to !== "string" ||
    typeof b.timestamp !== "string" ||
    typeof b.payload !== "object" ||
    b.payload === null
  ) {
    return null;
  }
  // 계약상 payload 세부는 이벤트별로 다르나, 라우트는 shape 검증만 하고
  // 세부 처리는 SessionHandler 가 판별 유니온으로 소비한다.
  return body as ClawOpsEvent;
}

export interface VoiceRouterDeps {
  handler: SessionHandler;
}

/** SessionHandler 를 주입해 /voice 라우트가 붙은 express 앱을 만든다 */
export function createVoiceApp(deps: VoiceRouterDeps): Express {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, service: "@colli/voice", live: deps.handler.liveCount });
  });

  app.post("/voice", async (req: Request, res: Response) => {
    const event = parseClawOpsEvent(req.body);
    if (!event) {
      res.status(400).json({ ok: false, error: "invalid ClawOps event" });
      return;
    }
    try {
      await deps.handler.handleEvent(event);
      res.status(200).json({ ok: true });
    } catch (err) {
      // 웹훅은 항상 빠르게 200/5xx 로 응답. 실패는 관측성 로그로 (핸들러 내부).
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : "handler error",
      });
    }
  });

  return app;
}
