/**
 * HttpToolClient 단위테스트 — fetch 를 목킹해 실 apps/api 서버 없이 검증한다.
 * (Orchestrator 지침: 실 서버 필요 없이 인프라 없이 통과해야 함)
 */
import { describe, it, expect, vi } from "vitest";
import type { TenantId } from "@colli/contracts";
import { HttpToolClient } from "./tool-client-http.js";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("HttpToolClient", () => {
  it("POST /tools/:name 을 올바른 URL/헤더/바디로 호출한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: true,
        tool: "get_kb_answer",
        data: { answer: "안내", sourceId: null, confidence: 0.9 },
      }),
    );

    const client = new HttpToolClient({
      baseUrl: "http://api.test:9999",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke(
      "get_kb_answer",
      { query: "사용법 알려줘" },
      { tenantId: "tenant_bobi" as TenantId },
    );

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test:9999/tools/get_kb_answer");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["content-type"]).toBe(
      "application/json",
    );
    expect((init.headers as Record<string, string>)["x-tenant-id"]).toBe(
      "tenant_bobi",
    );
    expect(init.body).toBe(JSON.stringify({ query: "사용법 알려줘" }));

    expect(res).toEqual({
      ok: true,
      tool: "get_kb_answer",
      data: { answer: "안내", sourceId: null, confidence: 0.9 },
    });
  });

  it("ctx 없이 호출하면 x-tenant-id 헤더를 빈 문자열로 보낸다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, tool: "get_kb_answer", data: { answer: "a", sourceId: null, confidence: 1 } }),
    );
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.invoke("get_kb_answer", { query: "q" });

    const [, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>)["x-tenant-id"]).toBe("");
  });

  it("apps/api 가 ok:false 봉투를 반환하면 그대로 전달한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        ok: false,
        tool: "create_ticket",
        error: { code: "validation_error", message: "invalid severity" },
      }),
    );
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke("create_ticket", {
      subscriberId: "sub_1" as never,
      category: "tech_error",
      summary: "buggy",
      severity: "low",
    });

    expect(res).toEqual({
      ok: false,
      tool: "create_ticket",
      error: { code: "validation_error", message: "invalid severity" },
    });
  });

  it("네트워크 에러(fetch reject)를 ok:false 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("ECONNREFUSED");
    });
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke("get_kb_answer", { query: "q" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("network_error");
      expect(res.error.message).toContain("ECONNREFUSED");
    }
  });

  it("비-2xx 응답을 ok:false 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({}, 500));
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke("get_kb_answer", { query: "q" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("http_500");
    }
  });

  it("JSON 파싱 실패를 ok:false 로 정규화한다", async () => {
    const fetchImpl = vi.fn(
      async () =>
        new Response("not json", {
          status: 200,
          headers: { "content-type": "text/plain" },
        }),
    );
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke("get_kb_answer", { query: "q" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invalid_json");
    }
  });

  it("shape 이 아닌 응답(ok 필드 없음)을 ok:false 로 정규화한다", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ unexpected: true }));
    const client = new HttpToolClient({
      baseUrl: "http://api.test",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    const res = await client.invoke("get_kb_answer", { query: "q" });

    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.error.code).toBe("invalid_response_shape");
    }
  });

  it("baseUrl 의 trailing slash 를 정규화한다", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ ok: true, tool: "get_kb_answer", data: { answer: "a", sourceId: null, confidence: 1 } }),
    );
    const client = new HttpToolClient({
      baseUrl: "http://api.test/",
      fetchImpl: fetchImpl as unknown as typeof fetch,
    });

    await client.invoke("get_kb_answer", { query: "q" });

    const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/tools/get_kb_answer");
  });

  it("baseUrl 미지정 시 process.env.API_BASE_URL 을 사용한다", async () => {
    const prev = process.env.API_BASE_URL;
    process.env.API_BASE_URL = "http://env.test:1234";
    try {
      const fetchImpl = vi.fn(async () =>
        jsonResponse({ ok: true, tool: "get_kb_answer", data: { answer: "a", sourceId: null, confidence: 1 } }),
      );
      const client = new HttpToolClient({
        fetchImpl: fetchImpl as unknown as typeof fetch,
      });
      await client.invoke("get_kb_answer", { query: "q" });
      const [url] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
      expect(url).toBe("http://env.test:1234/tools/get_kb_answer");
    } finally {
      if (prev === undefined) delete process.env.API_BASE_URL;
      else process.env.API_BASE_URL = prev;
    }
  });
});
