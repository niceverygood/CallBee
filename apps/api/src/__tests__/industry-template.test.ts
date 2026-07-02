/**
 * 업종 템플릿 팩 — 카탈로그 정합성 + 적용(비파괴 merge) + 컨트롤러/스코프.
 */
import { describe, it, expect } from "vitest";
import { ForbiddenException } from "@nestjs/common";
import {
  INDUSTRY_PRESET_KEYS,
  INDUSTRY_TEMPLATE_PACKS,
  SYSTEM_TOOL_NAMES,
  josa,
  planIndustryTemplateApply,
  withJosa,
  type TenantId,
} from "@colli/contracts";
import {
  makeTenantHarness,
  mockPlatformAdminReq,
  mockTenantAdminReq,
} from "./tenant-harness.js";

describe("INDUSTRY_TEMPLATE_PACKS — 카탈로그 정합성", () => {
  it("팩 key 는 유일하고, INDUSTRY_PRESETS 의 실업종(other 제외)과 1:1", () => {
    const packKeys = INDUSTRY_TEMPLATE_PACKS.map((p) => p.industryKey);
    expect(new Set(packKeys).size).toBe(packKeys.length);
    const presetKeys = INDUSTRY_PRESET_KEYS.filter((k) => k !== "other");
    expect([...packKeys].sort()).toEqual([...presetKeys].sort());
  });

  it("각 팩: 의도 key 유일 + KB category 는 팩 의도 참조 + 라우팅은 시스템 tool 만", () => {
    for (const pack of INDUSTRY_TEMPLATE_PACKS) {
      const intentKeys = pack.intents.map((i) => i.key);
      expect(new Set(intentKeys).size).toBe(intentKeys.length);

      for (const kb of pack.kbItems) {
        expect(intentKeys).toContain(kb.category);
      }
      for (const intent of pack.intents) {
        if (intent.routingToolName !== null) {
          expect(SYSTEM_TOOL_NAMES).toContain(intent.routingToolName);
        }
      }
    }
  });

  it("문자 프리필은 발송 플래그 전부 꺼짐(명시적 opt-in 원칙)", () => {
    for (const pack of INDUSTRY_TEMPLATE_PACKS) {
      expect(pack.smsSettings.confirmationEnabled).toBe(false);
      expect(pack.smsSettings.callbackNoticeEnabled).toBe(false);
      expect(pack.smsSettings.missedCallEnabled).toBe(false);
    }
  });

  it("답변 입력이 필요한 KB(enabledOnApply=false)는 안내 문구([ ])를 담는다", () => {
    for (const pack of INDUSTRY_TEMPLATE_PACKS) {
      for (const kb of pack.kbItems) {
        if (!kb.enabledOnApply) {
          expect(kb.answer.startsWith("[")).toBe(true);
        }
      }
    }
  });
});

describe("한국어 조사 자동 선택(korean.ts)", () => {
  it("받침 유무에 맞는 조사를 고른다", () => {
    expect(withJosa("윤정 파스타", "은/는")).toBe("윤정 파스타는");
    expect(withJosa("맛있는집", "은/는")).toBe("맛있는집은");
    expect(josa("그린내과의원", "이/가")).toBe("이");
    expect(josa("콜비", "이/가")).toBe("가");
  });

  it("숫자 끝은 독음 기준, 판정 불가(영문)는 병기형 유지", () => {
    expect(withJosa("매장24", "은/는")).toBe("매장24는"); // 4=사, 받침 없음
    expect(withJosa("스튜디오301", "은/는")).toBe("스튜디오301은"); // 1=일, 받침 있음
    expect(withJosa("CallBee", "은/는")).toBe("CallBee은(는)"); // 판정 불가 → 병기
  });
});

describe("planIndustryTemplateApply — 비파괴 merge 계획", () => {
  const pack = INDUSTRY_TEMPLATE_PACKS.find((p) => p.industryKey === "restaurant_cafe")!;

  it("빈 테넌트: 전부 생성 + {업체명} 치환 + 설정 신규 생성", () => {
    const plan = planIndustryTemplateApply(pack, {
      serviceName: "윤정 파스타",
      agentConfig: null,
      existingIntents: [],
      existingKbQuestions: [],
    });
    expect(plan.agentConfigCreated).toBe(true);
    expect(plan.agentConfigChanged).toBe(true);
    // 조사 인지 치환: "{업체명}은(는)" → 받침 없는 상호라 "윤정 파스타는"
    expect(plan.agentConfig.personaInstructions).toContain("윤정 파스타는 식당·카페입니다");
    expect(plan.agentConfig.personaInstructions).not.toContain("은(는)");
    expect(plan.agentConfig.personaInstructions).not.toContain("{업체명}");
    expect(plan.intentsToCreate.map((i) => i.key)).toEqual(pack.intents.map((i) => i.key));
    expect(plan.kbToCreate).toHaveLength(pack.kbItems.length);
    // 매장별 값이 필요한 KB 는 비활성으로 계획된다
    const disabled = plan.kbToCreate.filter((k) => !k.enabled);
    expect(disabled.length).toBe(pack.kbItems.filter((k) => !k.enabledOnApply).length);
  });

  it("기존 항목은 건드리지 않는다: 같은 key 의도/같은 질문 KB skip + 채워진 필드 유지", () => {
    const existingConfig = {
      tenantId: "t1" as TenantId,
      serviceName: "윤정 파스타",
      agentName: "봉봉",
      greetingText: "어서오세요!",
      personaInstructions: "사장님이 직접 쓴 소개",
      toneExtra: ["사투리로 친근하게"],
      domainConstraints: [pack.domainConstraints[0]!], // 팩과 1개 겹침
      intentUnresolvedFallbackTool: "request_callback",
      maxIntentAttempts: 2,
    };
    const plan = planIndustryTemplateApply(pack, {
      serviceName: "윤정 파스타",
      agentConfig: existingConfig,
      existingIntents: [{ key: "table_reservation", sortOrder: 5 }],
      existingKbQuestions: [pack.kbItems[0]!.question],
    });
    // 사장님이 쓴 값은 그대로
    expect(plan.agentConfig.personaInstructions).toBe("사장님이 직접 쓴 소개");
    expect(plan.agentConfig.greetingText).toBe("어서오세요!");
    expect(plan.agentConfig.agentName).toBe("봉봉");
    // 배열은 합집합(중복 없이 append)
    expect(plan.agentConfig.toneExtra[0]).toBe("사투리로 친근하게");
    expect(
      plan.agentConfig.domainConstraints.filter((c) => c === pack.domainConstraints[0]),
    ).toHaveLength(1);
    expect(plan.agentConfig.domainConstraints.length).toBe(
      1 + pack.domainConstraints.length - 1,
    );
    // 겹치는 의도/KB 는 skip
    expect(plan.skippedIntentKeys).toEqual(["table_reservation"]);
    expect(plan.intentsToCreate.map((i) => i.key)).not.toContain("table_reservation");
    expect(plan.skippedKbQuestions).toEqual([pack.kbItems[0]!.question]);
    // 신규 의도 sortOrder 는 기존 뒤에 배치
    for (const intent of plan.intentsToCreate) {
      expect(intent.sortOrder).toBeGreaterThan(5);
    }
  });

  it("같은 팩 재적용은 완전 no-op 계획(멱등)", () => {
    const first = planIndustryTemplateApply(pack, {
      serviceName: "윤정 파스타",
      agentConfig: null,
      existingIntents: [],
      existingKbQuestions: [],
    });
    const second = planIndustryTemplateApply(pack, {
      serviceName: "윤정 파스타",
      agentConfig: { tenantId: "t1" as TenantId, ...first.agentConfig },
      existingIntents: first.intentsToCreate.map((i) => ({
        key: i.key,
        sortOrder: i.sortOrder,
      })),
      existingKbQuestions: first.kbToCreate.map((k) => k.question),
    });
    expect(second.agentConfigChanged).toBe(false);
    expect(second.intentsToCreate).toHaveLength(0);
    expect(second.kbToCreate).toHaveLength(0);
  });
});

describe("POST /tenants/:id/industry-template — 컨트롤러/서비스 통합", () => {
  async function makeTenantWithPack(industryKey: string | null) {
    const h = makeTenantHarness();
    const tenant = await h.tenants.create({
      slug: "yj-pasta",
      name: "윤정 파스타",
      industryLabel: "식당·카페",
      industryKey,
      phoneNumber: "07011112222",
    });
    return { h, tenant };
  }

  it("가입 업종 팩 적용: 의도/KB/설정 생성 + 예시 KB 는 비활성", async () => {
    const { h, tenant } = await makeTenantWithPack("restaurant_cafe");
    const res = await h.controller.applyIndustryTemplate(
      mockPlatformAdminReq(),
      String(tenant.tenantId),
      {},
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.industryKey).toBe("restaurant_cafe");
    expect(res.data.agentConfigCreated).toBe(true);
    expect(res.data.createdIntentKeys).toContain("table_reservation");
    expect(res.data.createdKbQuestionsNeedingAnswer.length).toBeGreaterThan(0);

    // 저장 상태 검증
    const intents = await h.intents.list(tenant.tenantId);
    expect(intents.map((i) => String(i.key))).toContain("hours_holiday");
    const kbAll = await h.knowledge.list();
    const needing = kbAll.filter((k) => !k.enabled);
    expect(needing.length).toBe(res.data.createdKbQuestionsNeedingAnswer.length);
    // 비활성 KB 는 통화 검색(search)에 절대 노출되지 않는다
    const hits = await h.knowledge.search("영업시간");
    expect(hits.every((hit) => hit.item.enabled)).toBe(true);
    const config = await h.agentConfigs.get(tenant.tenantId);
    expect(config?.personaInstructions).toContain("윤정 파스타");
    expect(config?.smsSettings?.confirmationEnabled).toBe(false);
  });

  it("재적용은 멱등: 두 번째 호출은 전부 skip, 중복 생성 없음", async () => {
    const { h, tenant } = await makeTenantWithPack("restaurant_cafe");
    const req = mockPlatformAdminReq();
    await h.controller.applyIndustryTemplate(req, String(tenant.tenantId), {});
    const second = await h.controller.applyIndustryTemplate(req, String(tenant.tenantId), {});
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.data.createdIntentKeys).toHaveLength(0);
    expect(second.data.skippedIntentKeys.length).toBeGreaterThan(0);
    expect(second.data.createdKbQuestionsEnabled).toHaveLength(0);
    expect(second.data.createdKbQuestionsNeedingAnswer).toHaveLength(0);
    expect(second.data.agentConfigCreated).toBe(false);
    expect(second.data.agentConfigUpdated).toBe(false);

    const intents = await h.intents.list(tenant.tenantId);
    const keys = intents.map((i) => String(i.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("body.industryKey 로 다른 팩을 명시 적용할 수 있다", async () => {
    const { h, tenant } = await makeTenantWithPack("restaurant_cafe");
    const res = await h.controller.applyIndustryTemplate(
      mockPlatformAdminReq(),
      String(tenant.tenantId),
      { industryKey: "hospital_clinic" },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.data.industryKey).toBe("hospital_clinic");
    const config = await h.agentConfigs.get(tenant.tenantId);
    expect(config?.emergencyKeywords).toContain("응급");
  });

  it("팩이 없는 업종(other/미지정)은 template_not_found", async () => {
    const { h, tenant } = await makeTenantWithPack(null);
    const res = await h.controller.applyIndustryTemplate(
      mockPlatformAdminReq(),
      String(tenant.tenantId),
      {},
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("template_not_found");
  });

  it("없는 테넌트는 tenant_not_found", async () => {
    const h = makeTenantHarness();
    const res = await h.controller.applyIndustryTemplate(
      mockPlatformAdminReq(),
      "no-such-tenant",
      {},
    );
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error.code).toBe("tenant_not_found");
  });

  it("tenant_admin 은 타 테넌트에 적용 불가(403)", async () => {
    const { h, tenant } = await makeTenantWithPack("restaurant_cafe");
    await expect(
      h.controller.applyIndustryTemplate(
        mockTenantAdminReq("someone-else"),
        String(tenant.tenantId),
        {},
      ),
    ).rejects.toThrow(ForbiddenException);
  });
});
