/**
 * GET /tenants/resolve 응답의 systemPrompt 필드 — @colli/dialogue 의
 * buildTenantSystemPrompt 로 resolve 시점에 완성 조립되는지 검증.
 * 프롬프트 조립 로직 자체(가드레일 섹션 등)는 packages/dialogue 테스트가 소유
 * — 여기서는 "resolve 가 dialogue 단일 소스를 그대로 쓴다(패리티)" 만 고정한다.
 */
import { describe, it, expect } from "vitest";
import { buildTenantSystemPrompt } from "@colli/dialogue";
import type { BusinessHours } from "@colli/contracts";
import { TenantResolverService } from "../tenant-resolver.service.js";
import { makeTenantHarness } from "./tenant-harness.js";

const BASE_CONFIG = {
  serviceName: "테스트 식당",
  agentName: "식당봇",
  greetingText: "감사합니다, 테스트 식당입니다!",
  personaInstructions: "우리는 식당이고 예약 문의를 받습니다.",
  toneExtra: [] as string[],
  domainConstraints: [] as string[],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};

/** 모든 요일 00:00~24:00 — 항상 영업중(after-hours 미발동) */
const ALWAYS_OPEN: BusinessHours = {
  days: {
    mon: { open: "00:00", close: "24:00" },
    tue: { open: "00:00", close: "24:00" },
    wed: { open: "00:00", close: "24:00" },
    thu: { open: "00:00", close: "24:00" },
    fri: { open: "00:00", close: "24:00" },
    sat: { open: "00:00", close: "24:00" },
    sun: { open: "00:00", close: "24:00" },
  },
};

/** 모든 요일 정기 휴무 — 항상 영업시간 외(after-hours 발동) */
const ALWAYS_CLOSED: BusinessHours = {
  days: { mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null },
};

async function seedTenant(
  h: ReturnType<typeof makeTenantHarness>,
  configOverrides: Record<string, unknown> = {},
) {
  const tenant = await h.tenants.create({
    slug: "test-restaurant",
    name: "테스트 식당",
    phoneNumber: "07022223333",
    status: "active",
  });
  await h.agentConfigs.upsert(tenant.tenantId, { ...BASE_CONFIG, ...configOverrides });
  await h.intents.create(tenant.tenantId, {
    key: "reservation",
    label: "예약",
    routingToolName: "request_callback",
    sortOrder: 0,
  });
  return tenant;
}

describe("resolve — systemPrompt 완성 조립", () => {
  it("buildTenantSystemPrompt(agentConfig+intents) 출력과 바이트 동일하다(패리티)", async () => {
    const h = makeTenantHarness();
    await seedTenant(h);

    const ctx = await h.resolver.resolveByPhoneNumber("07022223333");
    expect(ctx).not.toBeNull();
    expect(ctx?.systemPrompt).toBe(
      buildTenantSystemPrompt({
        agentConfig: ctx!.agentConfig,
        intents: ctx!.intents,
        isAfterHours: false, // businessHours 미설정 → 24시간 응대 = 항상 영업중
      }),
    );
  });

  it("테넌트 커스텀(인사말/의도)과 플랫폼 불변 가드레일 섹션이 포함된다", async () => {
    const h = makeTenantHarness();
    await seedTenant(h);

    const ctx = await h.resolver.resolveByPhoneNumber("07022223333");
    const prompt = ctx?.systemPrompt ?? "";
    expect(prompt).toContain("감사합니다, 테스트 식당입니다!"); // greetingText
    expect(prompt).toContain("reservation (예약)"); // 의도 카탈로그
    expect(prompt).toContain("# 절대 금지 — 결제정보 음성수집"); // GUARDRAIL #1(불변)
    expect(prompt).toContain("# 통화 시작 고지 (필수)"); // GUARDRAIL #3(불변)
  });

  it("v3 영업시간: 영업중이면 영업시간 섹션만, 시간 외면 after-hours 최우선 지시가 실린다", async () => {
    // 영업중(모든 요일 00:00~24:00)
    const hOpen = makeTenantHarness();
    await seedTenant(hOpen, { businessHours: ALWAYS_OPEN });
    const open = await hOpen.resolver.resolveByPhoneNumber("07022223333");
    expect(open?.systemPrompt).toContain("# 영업시간");
    expect(open?.systemPrompt).not.toContain("# 지금은 영업시간 외");

    // 영업시간 외(모든 요일 휴무) — resolve 시점(now) 기준 판정
    const hClosed = makeTenantHarness();
    await seedTenant(hClosed, { businessHours: ALWAYS_CLOSED, afterHoursMode: "callback" });
    const closed = await hClosed.resolver.resolveByPhoneNumber("07022223333");
    expect(closed?.systemPrompt).toContain("# 지금은 영업시간 외 (최우선 지시)");
    expect(closed?.systemPrompt).toContain("request_callback");
  });

  it("deps.now 주입으로 영업시간 판정 시각을 고정할 수 있다(결정성)", async () => {
    const h = makeTenantHarness();
    const tenant = await seedTenant(h, {
      businessHours: {
        days: {
          mon: { open: "09:00", close: "18:00" },
          tue: null,
          wed: null,
          thu: null,
          fri: null,
          sat: null,
          sun: null,
        },
      } satisfies BusinessHours,
    });

    // 2026-07-06(월) 12:00 KST = 03:00 UTC → 영업중
    const atNoonMonday = new TenantResolverService({
      tenants: h.tenants,
      agentConfigs: h.agentConfigs,
      intents: h.intents,
      customTools: h.customTools,
      now: () => new Date("2026-07-06T03:00:00.000Z"),
    });
    const during = await atNoonMonday.resolveByTenantId(tenant.tenantId);
    expect(during?.systemPrompt).not.toContain("# 지금은 영업시간 외");

    // 2026-07-06(월) 22:00 KST = 13:00 UTC → 영업시간 외
    const atNightMonday = new TenantResolverService({
      tenants: h.tenants,
      agentConfigs: h.agentConfigs,
      intents: h.intents,
      customTools: h.customTools,
      now: () => new Date("2026-07-06T13:00:00.000Z"),
    });
    const after = await atNightMonday.resolveByTenantId(tenant.tenantId);
    expect(after?.systemPrompt).toContain("# 지금은 영업시간 외 (최우선 지시)");
  });

  it("컨트롤러 resolve 응답 봉투(data.systemPrompt)로도 노출된다", async () => {
    const h = makeTenantHarness();
    await seedTenant(h);
    const res = await h.controller.resolve("07022223333");
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(typeof res.data.systemPrompt).toBe("string");
      expect(res.data.systemPrompt!.length).toBeGreaterThan(100);
    }
  });
});
