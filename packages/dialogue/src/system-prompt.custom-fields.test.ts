/**
 * buildTenantSystemPrompt — v3 커스텀 필드(closingText/businessHours/afterHoursMode/
 * afterHoursText/transferPhoneNumber/emergencyKeywords/smsSettings) 렌더 테스트.
 *
 * 핵심 검증 3축:
 * 1. 골든 패리티 — 신규 필드가 전부 미설정/빈 값이면 출력이 기존과 **바이트 동일**.
 * 2. 필드별 섹션 렌더 — 값이 있을 때만 해당 섹션/줄이 지정 위치에 추가된다.
 * 3. GUARDRAIL 불변 — 어떤 필드 조합에서도 플랫폼 가드레일 문구는 항상 포함된다.
 */
import { describe, it, expect } from "vitest";
import { DEFAULT_SMS_SETTINGS } from "@colli/contracts";
import type { BusinessHours, TenantAgentConfig } from "@colli/contracts";
import {
  buildSystemPrompt,
  buildTenantSystemPrompt,
  BOBI_DEFAULT_AGENT_CONFIG,
  type TenantSystemPromptContext,
} from "./system-prompt.js";
import { BOBI_DEFAULT_TENANT_INTENTS } from "./classify-intent.js";

const BASE_CONFIG: TenantAgentConfig = { ...BOBI_DEFAULT_AGENT_CONFIG };

const HOURS: BusinessHours = {
  days: {
    mon: { open: "09:00", close: "18:00", breakStart: "15:00", breakEnd: "17:00" },
    tue: { open: "09:00", close: "18:00" },
    wed: { open: "09:00", close: "18:00" },
    thu: { open: "09:00", close: "18:00" },
    fri: { open: "09:00", close: "18:00" },
    sat: null,
    sun: null,
  },
  holidayDates: ["2026-07-07"],
  closedOnPublicHolidays: true,
  note: "매월 마지막 주 월요일은 정기 휴무입니다",
};

function ctxWith(
  configOverrides: Partial<TenantAgentConfig> = {},
  ctxOverrides: Partial<TenantSystemPromptContext> = {},
): TenantSystemPromptContext {
  return {
    agentConfig: { ...BASE_CONFIG, ...configOverrides },
    intents: BOBI_DEFAULT_TENANT_INTENTS,
    ...ctxOverrides,
  };
}

describe("골든 패리티 — 신규 필드 전부 미설정이면 출력 바이트 동일", () => {
  const baseline = buildTenantSystemPrompt(ctxWith());

  it("신규 필드를 명시적으로 빈 값(null/[]/기본 mode)으로 채워도 동일", () => {
    const explicitEmpty = buildTenantSystemPrompt(
      ctxWith({
        closingText: null,
        businessHours: null,
        afterHoursMode: "callback",
        afterHoursText: null,
        transferPhoneNumber: null,
        emergencyKeywords: [],
        smsSettings: null,
      }),
    );
    expect(explicitEmpty).toBe(baseline);
  });

  it("smsSettings 가 DEFAULT_SMS_SETTINGS(전부 off)여도 동일", () => {
    const p = buildTenantSystemPrompt(ctxWith({ smsSettings: DEFAULT_SMS_SETTINGS }));
    expect(p).toBe(baseline);
  });

  it("isAfterHours 만 true 고 businessHours 가 없으면 동일(무시)", () => {
    const p = buildTenantSystemPrompt(ctxWith({}, { isAfterHours: true }));
    expect(p).toBe(baseline);
  });

  it("isAfterHours=false 명시도 동일", () => {
    const p = buildTenantSystemPrompt(ctxWith({}, { isAfterHours: false }));
    expect(p).toBe(baseline);
  });

  it("기본 출력에 신규 섹션/문구가 하나도 없다", () => {
    for (const phrase of [
      "# 영업시간",
      "# 지금은 영업시간 외",
      "# 긴급 상황",
      "마무리 인사는 다음 문구를 사용합니다",
      "담당자 직통 연결 가능",
      "처리 후 안내 문자가 발송됨을 알립니다",
    ]) {
      expect(baseline).not.toContain(phrase);
    }
  });

  it("buildSystemPrompt(BoBi 전용)에도 신규 섹션이 없다(무변경 보증)", () => {
    const legacy = buildSystemPrompt();
    for (const phrase of ["# 영업시간", "# 긴급 상황", "담당자 직통 연결 가능"]) {
      expect(legacy).not.toContain(phrase);
    }
  });
});

describe("closingText — '# 마무리' 문구 줄 추가", () => {
  it("설정 시 마무리 섹션에 지정 문구 줄이 추가된다", () => {
    const p = buildTenantSystemPrompt(
      ctxWith({ closingText: "전화 주셔서 감사합니다. 좋은 하루 보내세요." }),
    );
    expect(p).toContain(
      `- 마무리 인사는 다음 문구를 사용합니다: "전화 주셔서 감사합니다. 좋은 하루 보내세요."`,
    );
    // 기존 마무리 기본 줄은 그대로 유지된다.
    expect(p).toContain("처리 결과(티켓 번호·콜백 예약·링크 발송 등)를 간단히 요약해 알립니다");
  });
});

describe("businessHours — '# 영업시간' 섹션(감정 섹션 앞)", () => {
  const p = buildTenantSystemPrompt(ctxWith({ businessHours: HOURS }));

  it("요일 요약·임시 휴무일·공휴일·비고·정확 응답 지시를 렌더한다", () => {
    expect(p).toContain("# 영업시간");
    expect(p).toContain("월 09:00~18:00(브레이크 15:00~17:00)");
    expect(p).toContain("화~금 09:00~18:00");
    expect(p).toContain("토·일 휴무");
    expect(p).toContain("- 임시 휴무일: 2026-07-07");
    expect(p).toContain("- 공휴일은 휴무입니다.");
    expect(p).toContain("- 안내: 매월 마지막 주 월요일은 정기 휴무입니다");
    expect(p).toContain("- 영업시간 문의에는 이 정보로 정확히 답합니다.");
  });

  it("감정 대응 섹션 앞에 위치한다", () => {
    expect(p.indexOf("# 영업시간")).toBeLessThan(p.indexOf("# 감정 대응"));
    expect(p.indexOf("# 영업시간")).toBeGreaterThan(p.indexOf("# 처리 방법"));
  });

  it("isAfterHours 미지정이면 '# 지금은 영업시간 외' 섹션은 없다", () => {
    expect(p).not.toContain("# 지금은 영업시간 외");
  });
});

describe("businessHours && isAfterHours — '# 지금은 영업시간 외' 최상위 지시", () => {
  it("mode=callback(기본): 기본 템플릿 + request_callback 콜백 접수 지시", () => {
    const p = buildTenantSystemPrompt(
      ctxWith({ businessHours: HOURS }, { isAfterHours: true }),
    );
    expect(p).toContain("# 지금은 영업시간 외 (최우선 지시)");
    expect(p).toContain(
      `"지금은 ${BASE_CONFIG.serviceName} 영업시간이 아닙니다. 성함과 연락처를 남겨주시면 영업시간에 바로 연락드리겠습니다."`,
    );
    expect(p).toContain("request_callback 으로 콜백을 접수합니다");
  });

  it("역할 섹션 다음, 톤 섹션 앞에 위치한다(최상위 지시)", () => {
    const p = buildTenantSystemPrompt(
      ctxWith({ businessHours: HOURS }, { isAfterHours: true }),
    );
    const afterHoursIdx = p.indexOf("# 지금은 영업시간 외");
    expect(afterHoursIdx).toBeGreaterThan(p.indexOf("# 역할"));
    expect(afterHoursIdx).toBeLessThan(p.indexOf("# 대화 톤과 방식"));
  });

  it("mode=callback + afterHoursText 커스텀이면 그 문구를 사용한다", () => {
    const p = buildTenantSystemPrompt(
      ctxWith(
        {
          businessHours: HOURS,
          afterHoursMode: "callback",
          afterHoursText: "지금은 통화가 어려워요. 연락처를 남겨주시면 아침에 바로 전화드릴게요.",
        },
        { isAfterHours: true },
      ),
    );
    expect(p).toContain(
      `"지금은 통화가 어려워요. 연락처를 남겨주시면 아침에 바로 전화드릴게요."`,
    );
    expect(p).not.toContain("성함과 연락처를 남겨주시면 영업시간에 바로 연락드리겠습니다");
  });

  it("mode=announce_hours: 영업시간 요약 안내 후 정중히 종료 지시", () => {
    const p = buildTenantSystemPrompt(
      ctxWith({ businessHours: HOURS, afterHoursMode: "announce_hours" }, { isAfterHours: true }),
    );
    expect(p).toContain("# 지금은 영업시간 외 (최우선 지시)");
    expect(p).toContain("영업시간은 월 09:00~18:00(브레이크 15:00~17:00), 화~금 09:00~18:00, 토·일 휴무입니다");
    expect(p).toContain("영업시간에 다시 전화해 주세요");
    expect(p).toContain("새 접수는 진행하지 않고, 영업시간을 안내한 뒤 정중히 통화를 마칩니다");
  });

  it("isAfterHours=false 면 businessHours 가 있어도 섹션이 없다", () => {
    const p = buildTenantSystemPrompt(
      ctxWith({ businessHours: HOURS }, { isAfterHours: false }),
    );
    expect(p).not.toContain("# 지금은 영업시간 외");
  });
});

describe("emergencyKeywords — '# 긴급 상황 (최우선)' 섹션(톤 섹션 앞)", () => {
  const p = buildTenantSystemPrompt(ctxWith({ emergencyKeywords: ["화재", "가스", "응급"] }));

  it("키워드 나열 + 즉시 escalate_to_human + 절차 생략 지시를 렌더한다", () => {
    expect(p).toContain("# 긴급 상황 (최우선)");
    expect(p).toContain("화재, 가스, 응급");
    expect(p).toContain("다른 어떤 절차보다 먼저 escalate_to_human 으로 즉시 사람에게 인계합니다");
    expect(p).toContain("긴급 상황에서는 의도 파악·본인확인 절차를 생략합니다.");
  });

  it("톤 섹션 앞에 위치한다", () => {
    expect(p.indexOf("# 긴급 상황 (최우선)")).toBeLessThan(p.indexOf("# 대화 톤과 방식"));
  });

  it("빈 배열이면 섹션이 없다", () => {
    const empty = buildTenantSystemPrompt(ctxWith({ emergencyKeywords: [] }));
    expect(empty).not.toContain("# 긴급 상황");
  });
});

describe("transferPhoneNumber — 처리 방법에 담당자 연결 안내(번호 원문 미포함)", () => {
  const PHONE = "010-9999-8888";
  const p = buildTenantSystemPrompt(ctxWith({ transferPhoneNumber: PHONE }));

  it("'# 처리 방법' 섹션에 담당자 연결 안내 줄이 추가된다", () => {
    expect(p).toContain(
      "- 사람 연결을 요청받거나 직접 처리가 필요한 사안이면 escalate_to_human 으로 담당자 연결을 시도합니다(담당자 직통 연결 가능).",
    );
  });

  it("전화번호 원문은 프롬프트 어디에도 넣지 않는다(발화 사고 방지)", () => {
    expect(p).not.toContain(PHONE);
    expect(p).not.toContain("9999");
  });
});

describe("smsSettings — 마무리에 문자 안내 줄", () => {
  it("enabled 항목이 하나라도 있으면 문자 발송 안내 줄이 추가된다", () => {
    for (const partial of [
      { confirmationEnabled: true },
      { callbackNoticeEnabled: true },
      { missedCallEnabled: true },
    ]) {
      const p = buildTenantSystemPrompt(
        ctxWith({ smsSettings: { ...DEFAULT_SMS_SETTINGS, ...partial } }),
      );
      expect(p).toContain("- 처리 후 안내 문자가 발송됨을 알립니다.");
    }
  });

  it("전부 off 면 문자 안내 줄이 없다", () => {
    const p = buildTenantSystemPrompt(ctxWith({ smsSettings: DEFAULT_SMS_SETTINGS }));
    expect(p).not.toContain("처리 후 안내 문자가 발송됨을 알립니다");
  });
});

describe("GUARDRAIL 불변 — 어떤 커스텀 조합에서도 플랫폼 가드레일 문구 유지", () => {
  const GUARDRAIL_PHRASES = [
    // #1 결제정보 음성수집 금지
    "카드번호",
    "CVC",
    "send_selfservice_link",
    // #2 상태 변경은 tool 로만
    "반드시 제공된 tool 호출로만",
    // #3 통화 초입 고지·동의
    "AI 상담원이 응대",
    "녹음",
    // #4 본인확인
    "본인확인",
    "lookup_subscriber",
  ];

  const ALL_CUSTOM: Partial<TenantAgentConfig> = {
    closingText: "감사합니다. 좋은 하루 보내세요.",
    businessHours: HOURS,
    afterHoursMode: "announce_hours",
    afterHoursText: "지금은 영업시간이 아닙니다.",
    transferPhoneNumber: "010-9999-8888",
    emergencyKeywords: ["화재", "응급"],
    smsSettings: { ...DEFAULT_SMS_SETTINGS, confirmationEnabled: true },
  };

  const combos: Array<[string, TenantSystemPromptContext]> = [
    ["빈 값", ctxWith()],
    ["closingText 만", ctxWith({ closingText: ALL_CUSTOM.closingText })],
    ["businessHours 만", ctxWith({ businessHours: HOURS })],
    ["영업시간 외(callback)", ctxWith({ businessHours: HOURS }, { isAfterHours: true })],
    [
      "영업시간 외(announce_hours)",
      ctxWith({ businessHours: HOURS, afterHoursMode: "announce_hours" }, { isAfterHours: true }),
    ],
    ["emergencyKeywords 만", ctxWith({ emergencyKeywords: ["화재"] })],
    ["transferPhoneNumber 만", ctxWith({ transferPhoneNumber: "010-9999-8888" })],
    [
      "smsSettings 만",
      ctxWith({ smsSettings: { ...DEFAULT_SMS_SETTINGS, missedCallEnabled: true } }),
    ],
    ["전부 설정", ctxWith(ALL_CUSTOM, { isAfterHours: true })],
  ];

  for (const [name, ctx] of combos) {
    it(`${name}: GUARDRAIL 문구 전부 포함`, () => {
      const p = buildTenantSystemPrompt(ctx);
      for (const phrase of GUARDRAIL_PHRASES) {
        expect(p).toContain(phrase);
      }
    });
  }

  it("전부 설정 상태에서도 결정론적(동일 ctx → 동일 출력)", () => {
    const ctx = ctxWith(ALL_CUSTOM, { isAfterHours: true });
    expect(buildTenantSystemPrompt(ctx)).toBe(buildTenantSystemPrompt(ctx));
  });
});
