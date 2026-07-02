/**
 * agent-config v3 신규 7필드(closingText/businessHours/afterHoursMode/afterHoursText/
 * transferPhoneNumber/emergencyKeywords/smsSettings) 왕복 + 검증 +
 * GET /tenants/resolve 반영(voice 소비) + status=active 방어 가드.
 */
import { describe, it, expect } from "vitest";
import type { BusinessHours, SmsSettings, TenantAgentConfig } from "@colli/contracts";
import { makeTenantHarness, mockPlatformAdminReq } from "./tenant-harness.js";

const BUSINESS_HOURS: BusinessHours = {
  days: {
    mon: { open: "09:00", close: "21:00", breakStart: "15:00", breakEnd: "17:00" },
    tue: { open: "09:00", close: "21:00" },
    wed: { open: "09:00", close: "21:00" },
    thu: { open: "09:00", close: "21:00" },
    fri: { open: "09:00", close: "23:00" },
    sat: { open: "11:00", close: "23:00" },
    sun: null, // 정기 휴무
  },
  holidayDates: ["2026-09-25"],
  closedOnPublicHolidays: true,
  note: "매월 마지막 주 월요일은 정기 휴무입니다",
};

const SMS_SETTINGS: SmsSettings = {
  confirmationEnabled: true,
  confirmationText: "[{업체명}] 문의가 접수되었습니다.",
  callbackNoticeEnabled: false,
  callbackNoticeText: null,
  missedCallEnabled: true,
  missedCallText: null,
};

function baseConfig(): Omit<TenantAgentConfig, "tenantId"> {
  return {
    serviceName: "테스트 식당",
    agentName: "식당봇",
    greetingText: null,
    personaInstructions: null,
    toneExtra: [],
    domainConstraints: [],
    intentUnresolvedFallbackTool: "request_callback",
    maxIntentAttempts: 2,
  };
}

function customConfig(): Omit<TenantAgentConfig, "tenantId"> {
  return {
    ...baseConfig(),
    closingText: "오늘도 맛있는 하루 보내세요. 감사합니다.",
    businessHours: BUSINESS_HOURS,
    afterHoursMode: "announce_hours",
    afterHoursText: "지금은 영업시간이 아닙니다. 영업시간에 다시 전화해 주세요.",
    transferPhoneNumber: "010-9999-8888",
    emergencyKeywords: ["화재", "가스", "응급"],
    smsSettings: SMS_SETTINGS,
  };
}

async function makeActiveTenant(h: ReturnType<typeof makeTenantHarness>) {
  const created = await h.controller.create({
    slug: "test-restaurant",
    name: "테스트 식당",
    phoneNumber: "07011112222",
    status: "active",
  });
  if (!created.ok) throw new Error("setup failed");
  return created.data.tenantId;
}

describe("PUT/GET /tenants/:id/agent-config — v3 신규 7필드 왕복", () => {
  it("신규 필드 전부 저장 후 GET 으로 동일하게 재조회된다", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);

    const put = await h.controller.putAgentConfig(
      mockPlatformAdminReq(),
      tenantId,
      customConfig(),
    );
    expect(put.ok).toBe(true);

    const got = await h.controller.getAgentConfig(mockPlatformAdminReq(), tenantId);
    expect(got.ok).toBe(true);
    if (!got.ok) return;
    expect(got.data.closingText).toBe("오늘도 맛있는 하루 보내세요. 감사합니다.");
    expect(got.data.businessHours).toEqual(BUSINESS_HOURS);
    expect(got.data.afterHoursMode).toBe("announce_hours");
    expect(got.data.afterHoursText).toBe(
      "지금은 영업시간이 아닙니다. 영업시간에 다시 전화해 주세요.",
    );
    expect(got.data.transferPhoneNumber).toBe("010-9999-8888");
    expect(got.data.emergencyKeywords).toEqual(["화재", "가스", "응급"]);
    expect(got.data.smsSettings).toEqual(SMS_SETTINGS);
  });

  it("신규 필드 없이 기존 shape 만 보내도 그대로 동작한다(하위호환)", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);
    const put = await h.controller.putAgentConfig(
      mockPlatformAdminReq(),
      tenantId,
      baseConfig(),
    );
    expect(put.ok).toBe(true);
    if (put.ok) expect(put.data.agentName).toBe("식당봇");
  });

  it("afterHoursMode 가 AFTER_HOURS_MODES 밖이면 invalid_params", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);
    const res = await h.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, {
      ...baseConfig(),
      afterHoursMode: "voicemail" as never,
    });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error.code).toBe("invalid_params");
  });

  it("transferPhoneNumber 형식 오류는 invalid_params (null 은 허용)", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);

    const bad = await h.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, {
      ...baseConfig(),
      transferPhoneNumber: "call-me-maybe",
    });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error.code).toBe("invalid_params");

    const nullOk = await h.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, {
      ...baseConfig(),
      transferPhoneNumber: null,
    });
    expect(nullOk.ok).toBe(true);
  });
});

describe("GET /tenants/resolve — 신규 필드 전달 + active 방어 가드", () => {
  it("resolve 의 agentConfig 에 신규 7필드가 실려 나간다(voice 가 소비)", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);
    await h.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, customConfig());

    const res = await h.controller.resolve("07011112222");
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.agentConfig.closingText).toBe(
      "오늘도 맛있는 하루 보내세요. 감사합니다.",
    );
    expect(res.data.agentConfig.businessHours).toEqual(BUSINESS_HOURS);
    expect(res.data.agentConfig.afterHoursMode).toBe("announce_hours");
    expect(res.data.agentConfig.transferPhoneNumber).toBe("010-9999-8888");
    expect(res.data.agentConfig.emergencyKeywords).toEqual(["화재", "가스", "응급"]);
    expect(res.data.agentConfig.smsSettings).toEqual(SMS_SETTINGS);
  });

  it("status !== active 테넌트는 매칭하지 않는다(suspended/pending_approval/rejected)", async () => {
    const h = makeTenantHarness();
    const tenantId = await makeActiveTenant(h);
    await h.controller.putAgentConfig(mockPlatformAdminReq(), tenantId, baseConfig());

    // active 일 땐 매칭
    const active = await h.controller.resolve("07011112222");
    expect(active.ok).toBe(true);

    // suspended 로 전환하면 매칭 안 됨(tenant_not_found)
    await h.controller.update(mockPlatformAdminReq(), tenantId, { status: "suspended" });
    const suspended = await h.controller.resolve("07011112222");
    expect(suspended.ok).toBe(false);
    if (!suspended.ok) expect(suspended.error.code).toBe("tenant_not_found");
  });
});
