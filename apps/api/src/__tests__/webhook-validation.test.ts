import { describe, it, expect } from "vitest";
import type { JsonSchemaObject } from "@colli/contracts";
import {
  validateWebhookUrl,
  validateCustomToolName,
  validateParamsSchema,
  validateParamsAgainstSchema,
  WebhookValidationError,
} from "../webhook-validation.js";

describe("validateWebhookUrl — SSRF 방지", () => {
  it("https + 공인 도메인은 통과", () => {
    expect(() => validateWebhookUrl("https://api.example.com/webhook")).not.toThrow();
  });

  it("http:// 는 거부", () => {
    expect(() => validateWebhookUrl("http://api.example.com/webhook")).toThrow(
      WebhookValidationError,
    );
  });

  it.each([
    "https://127.0.0.1/webhook",
    "https://10.0.0.5/webhook",
    "https://172.16.0.1/webhook",
    "https://172.31.255.255/webhook",
    "https://192.168.1.1/webhook",
    "https://169.254.169.254/webhook", // 클라우드 메타데이터 엔드포인트
    "https://localhost/webhook",
  ])("사설/루프백/링크로컬 대역(%s)은 거부", (url) => {
    expect(() => validateWebhookUrl(url)).toThrow(WebhookValidationError);
  });

  it("172.15.x / 172.32.x 는 사설대역 아님(경계값 확인)", () => {
    expect(() => validateWebhookUrl("https://172.15.0.1/webhook")).not.toThrow();
    expect(() => validateWebhookUrl("https://172.32.0.1/webhook")).not.toThrow();
  });

  it("잘못된 URL 형식은 거부", () => {
    expect(() => validateWebhookUrl("not-a-url")).toThrow(WebhookValidationError);
  });
});

describe("validateCustomToolName — 시스템 tool 이름 충돌 방지", () => {
  it("일반 식별자는 통과", () => {
    expect(() => validateCustomToolName("check_reservation")).not.toThrow();
  });

  it("SYSTEM_TOOL_NAMES 와 충돌하면 거부", () => {
    expect(() => validateCustomToolName("lookup_subscriber")).toThrow(
      WebhookValidationError,
    );
    expect(() => validateCustomToolName("get_kb_answer")).toThrow(
      WebhookValidationError,
    );
  });

  it("유효하지 않은 식별자 형태는 거부", () => {
    expect(() => validateCustomToolName("123bad")).toThrow(WebhookValidationError);
    expect(() => validateCustomToolName("has space")).toThrow(WebhookValidationError);
    expect(() => validateCustomToolName("")).toThrow(WebhookValidationError);
  });
});

describe("validateParamsSchema — JSON Schema 형태 강제", () => {
  it("올바른 스키마는 통과", () => {
    expect(() =>
      validateParamsSchema({
        type: "object",
        properties: { date: { type: "string" } },
        required: ["date"],
        additionalProperties: false,
      }),
    ).not.toThrow();
  });

  it("type이 object가 아니면 거부", () => {
    expect(() =>
      validateParamsSchema({ type: "string", additionalProperties: false, properties: {} }),
    ).toThrow(WebhookValidationError);
  });

  it("additionalProperties가 false가 아니면 거부", () => {
    expect(() =>
      validateParamsSchema({ type: "object", properties: {}, additionalProperties: true }),
    ).toThrow(WebhookValidationError);
  });

  it("properties가 없으면 거부", () => {
    expect(() =>
      validateParamsSchema({ type: "object", additionalProperties: false }),
    ).toThrow(WebhookValidationError);
  });
});

describe("validateParamsAgainstSchema — 런타임 파라미터 검증", () => {
  const schema: JsonSchemaObject = {
    type: "object",
    properties: {
      date: { type: "string" },
      partySize: { type: "integer" },
    },
    required: ["date"],
    additionalProperties: false,
  };

  it("유효한 파라미터는 통과", () => {
    expect(() => validateParamsAgainstSchema(schema, { date: "2026-07-01", partySize: 4 })).not.toThrow();
  });

  it("필수 파라미터 누락 시 거부", () => {
    expect(() => validateParamsAgainstSchema(schema, { partySize: 4 })).toThrow(
      WebhookValidationError,
    );
  });

  it("스키마에 없는 파라미터 포함 시 거부(additionalProperties:false)", () => {
    expect(() =>
      validateParamsAgainstSchema(schema, { date: "2026-07-01", extra: "x" }),
    ).toThrow(WebhookValidationError);
  });

  it("타입 불일치 시 거부", () => {
    expect(() =>
      validateParamsAgainstSchema(schema, { date: "2026-07-01", partySize: "four" }),
    ).toThrow(WebhookValidationError);
  });

  it("params가 object가 아니면 거부", () => {
    expect(() => validateParamsAgainstSchema(schema, "nope")).toThrow(WebhookValidationError);
  });
});
