/**
 * E2E 스모크 테스트(인프라 없이, 전부 목):
 * 1) BoBi(테넌트 #1) 흐름 — 기존 8개 시스템 tool 이 v1과 동일하게 동작(tenantId=bobi 스코프).
 * 2) 신규 가상 테넌트(slug=test-restaurant) — 커스텀 tool 1개(mock webhook 서버)가
 *    등록→해석(resolve)→호출까지 정상 동작.
 *
 * "완료 기준"(브리핑) 검증: 마이그레이션 적용 후 시드 데이터로 기존 tool 호출 흐름이
 * v1과 동일하게 동작 + 신규 가상 테넌트의 커스텀 tool 정상 호출.
 * 실제 마이그레이션/DB 는 사용하지 않고 인메모리 포트로 동일 계약을 검증한다.
 */
import { describe, it, expect } from "vitest";
import type { CallSessionId, TenantId } from "@colli/contracts";
import { makeHarness, makeSubscriber } from "./harness.js";
import { makeTenantHarness, mockPlatformAdminReq } from "./tenant-harness.js";
import { ToolsController } from "../tools.controller.js";

// docs/tenant-platform-architecture.md §4.3 의 BoBi 기본 의도 카탈로그(7종).
// @colli/dialogue 의 BOBI_DEFAULT_TENANT_INTENTS 와 동일한 값(routingToolName/
// sortOrder 포함)을 이 테스트 파일 안에서 재현한다 — apps/api 는 devDependency
// 로 @colli/dialogue 를 추가하지 않고(불필요한 워크스페이스 간 결합 최소화),
// 이 워커 범위(pnpm install 금지)에서 심링크 없이도 typecheck/test 가 통과하게
// 하기 위함이다. 실제 seed 스크립트(packages/db/prisma/seed-bobi-tenant.ts)는
// @colli/dialogue 를 직접 import 해 단일 소스를 재사용한다.
const BOBI_DEFAULT_TENANT_INTENTS_FIXTURE = [
  { key: "usage", label: "사용법", keywords: [], routingToolName: "get_kb_answer", sortOrder: 0, enabled: true },
  { key: "billing", label: "결제", keywords: [], routingToolName: "send_selfservice_link", sortOrder: 1, enabled: true },
  { key: "tech_error", label: "기술오류", keywords: [], routingToolName: "create_ticket", sortOrder: 2, enabled: true },
  { key: "upgrade", label: "요금제·업그레이드", keywords: [], routingToolName: "route_to_sales", sortOrder: 3, enabled: true },
  { key: "churn", label: "해지", keywords: [], routingToolName: "route_to_sales", sortOrder: 4, enabled: true },
  { key: "new_signup", label: "신규가입", keywords: [], routingToolName: "route_to_sales", sortOrder: 5, enabled: true },
  { key: "other", label: "기타", keywords: [], routingToolName: null, sortOrder: 6, enabled: true },
] as const;

describe("E2E 스모크: BoBi(테넌트 #1) — 기존 8개 tool 이 tenantId 스코프로 v1과 동일 동작", () => {
  it("본인확인 → KB 조회 → 티켓 생성 흐름이 tenantId 헤더 유무와 무관하게 그대로 동작", async () => {
    const sub = makeSubscriber({ phone: "+821055556666" });
    const h = makeHarness({ subscribers: [sub] });
    const th = makeTenantHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    // BoBi 테넌트 시딩(§4 값)
    const bobi = await th.controller.create({
      slug: "bobi",
      name: "BoBi",
      industryLabel: "보험설계사 SaaS",
      phoneNumber: "07052361037",
      status: "active",
      plan: "enterprise",
    });
    expect(bobi.ok).toBe(true);
    if (!bobi.ok) return;

    await th.controller.putAgentConfig(mockPlatformAdminReq(), bobi.data.tenantId, {
      serviceName: "BoBi",
      agentName: "보비",
      greetingText: null,
      personaInstructions: null,
      toneExtra: [],
      domainConstraints: [],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });
    for (const intent of BOBI_DEFAULT_TENANT_INTENTS_FIXTURE) {
      await th.controller.createIntent(mockPlatformAdminReq(), bobi.data.tenantId, {
        ...intent,
        keywords: [...intent.keywords],
      });
    }

    // 070 라우팅 조회(voice 워커가 소비하는 것과 동일 경로)
    const resolved = await th.controller.resolve("07052361037");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.intents.length).toBe(7);
      expect(resolved.data.toolSchemas.filter((s) => s.kind === "system").length).toBe(8);
      expect(resolved.data.toolSchemas.filter((s) => s.kind === "custom").length).toBe(0);
    }

    // 기존 v1 시스템 tool 흐름 — 컨트롤러 경유(x-tenant-id 헤더 없이도 동작해야 함)
    const lookup = await ctrl.invoke("lookup_subscriber", { phone: sub.phone }, "call_e2e");
    expect(lookup.ok).toBe(true);

    const ticket = await ctrl.invoke(
      "create_ticket",
      {
        subscriberId: sub.subscriberId,
        category: "tech_error",
        summary: "동기화 실패",
        severity: "medium",
      },
      "call_e2e",
    );
    expect(ticket.ok).toBe(true);
  });
});

describe("E2E 스모크: 신규 가상 테넌트(slug=test-restaurant) — 커스텀 tool 1개 정상 호출", () => {
  it("가입 → agent-config → tool 등록 → resolve → LLM 호출 흐름을 mock webhook 서버로 전부 검증", async () => {
    const th = makeTenantHarness();
    const h = makeHarness();
    const ctrl = new ToolsController(h.service, th.executor);

    const WEBHOOK_URL = "https://test-restaurant.example.com/webhook";

    // 1) 신규 가입
    const created = await th.controller.create({
      slug: "test-restaurant",
      name: "테스트 식당",
      industryLabel: "식당",
      phoneNumber: "07033334444",
      status: "onboarding",
      plan: "trial",
    });
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const tenantId = created.data.tenantId;

    // 2) 에이전트 설정
    await th.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, {
      serviceName: "테스트 식당",
      agentName: "식당봇",
      greetingText: "안녕하세요, 테스트 식당입니다.",
      personaInstructions: "예약/메뉴 문의만 응대하는 식당 AI 상담원입니다.",
      toneExtra: [],
      domainConstraints: ["의료 조언을 하지 않습니다."],
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    });

    // 3) 의도 카탈로그(자유 정의)
    await th.controller.createIntent(mockPlatformAdminReq(), tenantId, {
      key: "reservation",
      label: "예약",
      keywords: ["예약", "자리"],
      routingToolName: "check_reservation",
      sortOrder: 0,
    });

    // 4) 커스텀 tool 등록(mock webhook 서버 대상)
    const tool = await th.controller.createTool(mockPlatformAdminReq(), tenantId, {
      name: "check_reservation",
      description: "예약 가능 여부를 확인한다.",
      paramsSchema: {
        type: "object",
        properties: {
          date: { type: "string", description: "예약 희망 날짜" },
          partySize: { type: "integer", description: "인원 수" },
        },
        required: ["date", "partySize"],
        additionalProperties: false,
      },
      webhookUrl: WEBHOOK_URL,
      webhookSecret: "restaurant-secret",
    });
    expect(tool.ok).toBe(true);

    // 상태를 active 로 전환(운영 개시)
    await th.controller.update(mockPlatformAdminReq(), tenantId, { status: "active" });

    // 5) 070 라우팅 조회 — apps/voice 가 인바운드 콜에서 호출하는 것과 동일 경로
    const resolved = await th.controller.resolve("07033334444");
    expect(resolved.ok).toBe(true);
    if (resolved.ok) {
      expect(resolved.data.tenant.slug).toBe("test-restaurant");
      const customSchema = resolved.data.toolSchemas.find((s) => s.kind === "custom");
      expect(customSchema?.name).toBe("check_reservation");
    }

    // 6) mock webhook 서버가 예약 가능 응답을 반환하도록 시나리오 등록
    th.webhookInvoker.respond(WEBHOOK_URL, {
      ok: true,
      data: { available: true, table: "A3" },
    });

    // 7) LLM 이 tool 을 호출한 것처럼 ToolsController 경유(voice 워커 경로 재현)
    const res = await ctrl.invoke(
      "check_reservation",
      { date: "2026-07-01", partySize: 2 },
      "call_dubu_1" as CallSessionId,
      tenantId,
    );
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data).toEqual({ available: true, table: "A3" });
    }

    // trace 에 tenantId 스코프 + custom: 프리픽스로 기록됨
    expect(th.trace.entries.some((e) => e.toolName === "custom:check_reservation")).toBe(
      true,
    );

    // 8) 다른 테넌트는 이 tool 을 호출할 수 없다(격리 확인)
    const otherTenant = await th.controller.create({
      slug: "other-tenant",
      name: "다른 테넌트",
      phoneNumber: "07055556666",
    });
    expect(otherTenant.ok).toBe(true);
    if (!otherTenant.ok) return;
    const isolatedRes = await ctrl.invoke(
      "check_reservation",
      { date: "2026-07-01", partySize: 2 },
      "call_dubu_2" as CallSessionId,
      otherTenant.data.tenantId,
    );
    expect(isolatedRes.ok).toBe(false);
    if (!isolatedRes.ok) expect(isolatedRes.error.code).toBe("tool_not_found");
  });

  it("SYSTEM_TOOL_NAMES 와 충돌하는 이름은 애초에 등록되지 않는다(격리 2차 방어선 사전 검증)", async () => {
    const th = makeTenantHarness();
    const created = await th.controller.create({
      slug: "test-restaurant-2",
      name: "테스트 식당2",
      phoneNumber: "07044445555",
    });
    if (!created.ok) throw new Error("setup failed");

    const res = await th.controller.createTool(mockPlatformAdminReq(), created.data.tenantId, {
      name: "create_ticket", // 시스템 tool 과 충돌
      description: "충돌 시도",
      paramsSchema: { type: "object", properties: {}, additionalProperties: false },
      webhookUrl: "https://test-restaurant.example.com/webhook",
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("tool_name_conflicts_with_system_tool");
  });
});
