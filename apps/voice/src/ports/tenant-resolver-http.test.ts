/**
 * HttpTenantResolver 단위테스트 — fetch 를 목킹해 실 apps/api 서버 없이 검증한다.
 * (Orchestrator 지침: 실 서버 필요 없이 인프라 없이 통과해야 함)
 */
import { describe, it, expect, vi } from "vitest";
import type { ResolvedTenantAgentContext } from "@colli/contracts";
import { HttpTenantResolver } from "./tenant-resolver-http.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const SAMPLE_CTX = {
  tenant: {
    tenantId: "tenant_bobi",
    slug: "bobi",
    name: "BoBi",
    industryLabel: "보험설계사 SaaS",
    phoneNumber: "07052361037",
    status: "active",
    plan: "enterprise",
  },
  agentConfig: {
    tenantId: "tenant_bobi",
    serviceName: "BoBi",
    agentName: "보비",
    greetingText: null,
    personaInstructions: null,
    toneExtra: [],
    domainConstraints: [],
    intentUnresolvedFallbackTool: "request_callback",
    maxIntentAttempts: 2,
  },
  intents: [],
  toolSchemas: [],
} as unknown as ResolvedTenantAgentContext;

describe("HttpTenantResolver", () => {
  it("GET /tenants/resolve?toNumber=... 를 올바른 URL 로 호출하고 data 를 반환한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: SAMPLE_CTX }),
    );
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test:9999",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await resolver.resolve("07052361037");

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      "http://api.test:9999/tenants/resolve?toNumber=07052361037",
    );
    expect(res).toEqual(SAMPLE_CTX);
  });

  it("toNumber 를 URL 인코딩한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, data: SAMPLE_CTX }),
    );
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await resolver.resolve("+82 10-1234-5678");

    const [url] = fetchImpl.mock.calls[0] as unknown as [string];
    expect(url).toBe(
      `http://api.test/tenants/resolve?toNumber=${encodeURIComponent("+82 10-1234-5678")}`,
    );
  });

  it("ok:false(tenant_not_found) 응답을 null 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: false,
        error: { code: "tenant_not_found", message: "no tenant for 000" },
      }),
    );
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await resolver.resolve("000");
    expect(res).toBeNull();
  });

  it("네트워크 에러(fetch reject)를 null 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("timeout");
    });
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await resolver.resolve("07052361037");
    expect(res).toBeNull();
  });

  it("비-2xx 응답을 null 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await resolver.resolve("07052361037");
    expect(res).toBeNull();
  });

  it("JSON 파싱 실패를 null 로 정규화한다", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    const resolver = new HttpTenantResolver({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await resolver.resolve("07052361037");
    expect(res).toBeNull();
  });

  it("baseUrl 미지정 시 process.env.API_BASE_URL 을 사용한다", async () => {
    const prev = process.env.API_BASE_URL;
    process.env.API_BASE_URL = "http://env.test:1234";
    try {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ ok: true, data: SAMPLE_CTX }),
      );
      const resolver = new HttpTenantResolver({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await resolver.resolve("07052361037");
      const [url] = fetchImpl.mock.calls[0] as unknown as [string];
      expect(url).toBe(
        "http://env.test:1234/tenants/resolve?toNumber=07052361037",
      );
    } finally {
      if (prev === undefined) delete process.env.API_BASE_URL;
      else process.env.API_BASE_URL = prev;
    }
  });
});
