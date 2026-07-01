/**
 * HttpTenantResolver — TenantResolverPort 의 실(HTTP) 구현.
 *
 * apps/api 의 `GET /tenants/resolve?toNumber=...` 를 호출한다
 * (apps/api/src/tenants.controller.ts, 이미 구현됨, 확인 완료). 응답 봉투는
 * `{ok:true,data:ResolvedTenantAgentContext} | {ok:false,error:{code,message}}`
 * (미등록 번호는 `error.code === "tenant_not_found"`).
 *
 * 이 포트는 `ok:false`(테넌트 없음 포함) 뿐 아니라 네트워크 에러/타임아웃/파싱
 * 실패까지 전부 `null` 로 정규화한다 — session-handler.ts 의 onInitiated 는
 * null 을 "미등록 070 번호" 안전 폴백 경로로만 처리하면 된다(예외 없음).
 */
import type { ResolvedTenantAgentContext } from "@colli/contracts";
import type { TenantResolverPort } from "./tenant-resolver.js";

export interface HttpTenantResolverOptions {
  /** apps/api 베이스 URL. 기본값: process.env.API_BASE_URL ?? "http://localhost:3001" */
  baseUrl?: string;
  /** 테스트/커스텀 환경 주입용 fetch. 기본값: 전역 fetch */
  fetchImpl?: typeof fetch;
}

function defaultBaseUrl(): string {
  return process.env.API_BASE_URL ?? "http://localhost:3001";
}

export class HttpTenantResolver implements TenantResolverPort {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;

  constructor(options: HttpTenantResolverOptions = {}) {
    this.baseUrl = (options.baseUrl ?? defaultBaseUrl()).replace(/\/+$/, "");
    this.fetchImpl = options.fetchImpl ?? fetch;
  }

  async resolve(toNumber: string): Promise<ResolvedTenantAgentContext | null> {
    let res: Response;
    try {
      res = await this.fetchImpl(
        `${this.baseUrl}/tenants/resolve?toNumber=${encodeURIComponent(toNumber)}`,
      );
    } catch {
      // 네트워크 에러/타임아웃 — 미등록 취급(안전 폴백)
      return null;
    }

    if (!res.ok) return null;

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return null;
    }

    if (typeof body !== "object" || body === null) return null;
    const b = body as Record<string, unknown>;
    if (b.ok !== true) return null;
    if (typeof b.data !== "object" || b.data === null) return null;

    return b.data as ResolvedTenantAgentContext;
  }
}
