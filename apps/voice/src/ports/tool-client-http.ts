/**
 * HttpToolClient — ToolClient 포트의 실(HTTP) 구현.
 *
 * apps/api 의 `POST /tools/:name` 을 호출한다(apps/api/src/tools.controller.ts,
 * 이미 구현됨, 확인 완료):
 *  - 헤더: `x-tenant-id` (커스텀 tool 실행 시 필수, 시스템 tool 은 아직 미사용이지만
 *    voice 워커는 항상 보낸다 — 컨트롤러가 무시해도 무해함).
 *  - 바디: tool params(JSON) 그대로.
 *  - 응답: `ToolInvocationResult` 봉투 그대로
 *    (`{ok:true,tool,data} | {ok:false,tool,error:{code,message}}`).
 *
 * 네트워크 에러/비-2xx/파싱 실패는 전부 `{ok:false, tool, error:{code,message}}` 로
 * 정규화해 돌려준다 — 세션 핸들러(session-handler.ts runTool)는 ok:false 분기만으로
 * 안전하게 폴백할 수 있어야 한다(예외를 던지지 않는다).
 */
import type {
  ToolName,
  ToolParams,
  ToolInvocationResult,
} from "@colli/contracts";
import type { ToolClient, ToolInvokeContext } from "./tool-client.js";

export interface HttpToolClientOptions {
  /** apps/api 베이스 URL. 기본값: process.env.API_BASE_URL ?? "http://localhost:3001" */
  baseUrl?: string;
  /** 테스트/커스텀 환경 주입용 fetch. 기본값: 전역 fetch */
  fetchImpl?: typeof fetch;
}

function defaultBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3001";
}

export class HttpToolClient implements ToolClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpToolClientOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async invoke<T extends ToolName>(
    tool: T,
    params: ToolParams<T>,
    ctx?: ToolInvokeContext,
  ): Promise<ToolInvocationResult<T>> {
    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}/tools/${tool}`, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-tenant-id": ctx?.tenantId ?? "",
        },
        body: JSON.stringify(params),
      });
    } catch (err) {
      return {
        ok: false,
        tool,
        error: {
          code: "network_error",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    if (!res.ok) {
      return {
        ok: false,
        tool,
        error: {
          code: `http_${res.status}`,
          message: `POST /tools/${tool} failed with status ${res.status}`,
        },
      };
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch (err) {
      return {
        ok: false,
        tool,
        error: {
          code: "invalid_json",
          message: err instanceof Error ? err.message : String(err),
        },
      };
    }

    if (!isToolInvocationResultShape(body)) {
      return {
        ok: false,
        tool,
        error: {
          code: "invalid_response_shape",
          message: "response body is not a valid ToolInvocationResult envelope",
        },
      };
    }

    return body as ToolInvocationResult<T>;
  }
}

/** 최소한의 런타임 shape 검증 — ToolInvocationResult 판별 유니온 형태인지만 확인 */
function isToolInvocationResultShape(body: unknown): boolean {
  if (typeof body !== "object" || body === null) return false;
  const b = body as Record<string, unknown>;
  if (typeof b.ok !== "boolean") return false;
  if (b.ok === true) return "data" in b;
  return (
    typeof b.error === "object" &&
    b.error !== null &&
    typeof (b.error as Record<string, unknown>).code === "string"
  );
}
