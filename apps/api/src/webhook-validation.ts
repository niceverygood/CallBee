/**
 * 테넌트 커스텀 tool 등록 시 webhookUrl/paramsSchema/name 검증(저장 전 방어선).
 * docs/tenant-platform-architecture.md §5.1 규칙:
 * - webhookUrl 은 https:// 강제.
 * - 사설/루프백/링크로컬 IP 대역 차단(SSRF 방지). 호스트가 IP 리터럴이 아니면
 *   (도메인이면) 이 레벨에서는 문자열 검사만 하고, DNS 리바인딩 방지는
 *   통합 단계(실제 fetch 시 재해석) 책임으로 남긴다 — 이 함수는 명백한 사설
 *   IP 리터럴/로컬호스트 호스트명만 1차로 걸러낸다.
 * - name 이 SYSTEM_TOOL_NAMES 와 충돌 금지.
 * - paramsSchema 가 {type:'object', additionalProperties:false} 형태인지 검증.
 */
import { SYSTEM_TOOL_NAMES, type JsonSchemaObject } from "@colli/contracts";

export class WebhookValidationError extends Error {
  constructor(
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "WebhookValidationError";
  }
}

const PRIVATE_HOSTNAMES = new Set(["localhost", "0.0.0.0"]);

/** IPv4 옥텟이 사설/루프백/링크로컬 대역인지 확인. */
function isPrivateIpv4(host: string): boolean {
  const m = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (!m) return false;
  const [a, b] = [Number(m[1]), Number(m[2])];
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // 127.0.0.0/8 loopback
  if (a === 169 && b === 254) return true; // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  return false;
}

function isPrivateIpv6(host: string): boolean {
  const h = host.toLowerCase();
  return h === "::1" || h.startsWith("fc") || h.startsWith("fd") || h.startsWith("fe80");
}

/** https + 사설 IP 대역 차단(SSRF 방지). 통과하면 아무것도 반환하지 않는다. */
export function validateWebhookUrl(webhookUrl: string): void {
  let url: URL;
  try {
    url = new URL(webhookUrl);
  } catch {
    throw new WebhookValidationError("invalid_webhook_url", "webhookUrl is not a valid URL");
  }
  if (url.protocol !== "https:") {
    throw new WebhookValidationError(
      "webhook_url_not_https",
      "webhookUrl must use https://",
    );
  }
  const host = url.hostname;
  if (PRIVATE_HOSTNAMES.has(host.toLowerCase())) {
    throw new WebhookValidationError(
      "webhook_url_private_ip",
      "webhookUrl must not target localhost",
    );
  }
  if (isPrivateIpv4(host) || isPrivateIpv6(host)) {
    throw new WebhookValidationError(
      "webhook_url_private_ip",
      "webhookUrl must not target a private/loopback/link-local IP range",
    );
  }
}

/** name 이 시스템 tool 이름과 충돌하지 않는지 확인. */
export function validateCustomToolName(name: string): void {
  if (!name || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name)) {
    throw new WebhookValidationError(
      "invalid_tool_name",
      "name must be a valid function-name-like identifier",
    );
  }
  if ((SYSTEM_TOOL_NAMES as readonly string[]).includes(name)) {
    throw new WebhookValidationError(
      "tool_name_conflicts_with_system_tool",
      `name "${name}" conflicts with a system tool name`,
    );
  }
}

/** paramsSchema 가 {type:'object', additionalProperties:false} 형태인지 검증. */
export function validateParamsSchema(schema: unknown): asserts schema is JsonSchemaObject {
  if (typeof schema !== "object" || schema === null) {
    throw new WebhookValidationError(
      "invalid_params_schema",
      "paramsSchema must be an object",
    );
  }
  const s = schema as Record<string, unknown>;
  if (s.type !== "object") {
    throw new WebhookValidationError(
      "invalid_params_schema",
      "paramsSchema.type must be 'object'",
    );
  }
  if (s.additionalProperties !== false) {
    throw new WebhookValidationError(
      "invalid_params_schema",
      "paramsSchema.additionalProperties must be false",
    );
  }
  if (typeof s.properties !== "object" || s.properties === null) {
    throw new WebhookValidationError(
      "invalid_params_schema",
      "paramsSchema.properties must be an object",
    );
  }
  if (s.required !== undefined && !Array.isArray(s.required)) {
    throw new WebhookValidationError(
      "invalid_params_schema",
      "paramsSchema.required must be an array when present",
    );
  }
}

/** 런타임 파라미터가 paramsSchema 를 만족하는지 최소 수동 검증(ajv 미설치 상태 대응). */
export function validateParamsAgainstSchema(
  schema: JsonSchemaObject,
  params: unknown,
): void {
  if (typeof params !== "object" || params === null || Array.isArray(params)) {
    throw new WebhookValidationError("invalid_params", "params must be an object");
  }
  const obj = params as Record<string, unknown>;
  for (const required of schema.required ?? []) {
    if (!(required in obj)) {
      throw new WebhookValidationError(
        "invalid_params",
        `missing required param: ${required}`,
      );
    }
  }
  if (schema.additionalProperties === false) {
    const allowed = new Set(Object.keys(schema.properties));
    for (const key of Object.keys(obj)) {
      if (!allowed.has(key)) {
        throw new WebhookValidationError(
          "invalid_params",
          `unexpected param: ${key}`,
        );
      }
    }
  }
  for (const [key, propSchema] of Object.entries(schema.properties)) {
    if (!(key in obj)) continue;
    validatePropertyType(key, propSchema.type, obj[key]);
  }
}

function validatePropertyType(key: string, type: string, value: unknown): void {
  const actual = Array.isArray(value) ? "array" : typeof value;
  const ok =
    (type === "string" && actual === "string") ||
    (type === "number" && actual === "number") ||
    (type === "integer" && actual === "number" && Number.isInteger(value)) ||
    (type === "boolean" && actual === "boolean") ||
    (type === "array" && actual === "array") ||
    (type === "object" && actual === "object");
  if (!ok) {
    throw new WebhookValidationError(
      "invalid_params",
      `param "${key}" expected type ${type}, got ${actual}`,
    );
  }
}
