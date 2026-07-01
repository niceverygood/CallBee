/**
 * BoBi 상담 system prompt 빌더 (Worker B → dialogue 일반화).
 *
 * 결정론적 텍스트 조립기 — 런타임에 LLM(OpenAI Realtime 등) 세션의 system 지시로 주입된다.
 * 톤: 친절·간결, 한 번에 하나만 질문, 이름/전화번호/날짜는 복창 확인.
 * 가드레일(CLAUDE.md #1~#7)을 프롬프트 차원에서 반영한다.
 *
 * ⚠️ 이 모듈은 LLM 을 호출하지 않는다. 오직 프롬프트 문자열을 생성한다.
 *
 * 이 파일은 두 개의 공개 빌더를 제공한다:
 * - `buildSystemPrompt(options)`: 기존 BoBi 전용 빌더. **옵션/시그니처/출력 로직을
 *   절대 변경하지 않는다** — 동일 옵션이면 리팩터 전후 단 한 글자도 다르지 않아야 한다
 *   (system-prompt.test.ts 8개가 이를 검증).
 * - `buildTenantSystemPrompt(ctx)`: 신규 테넌트 일반화 빌더. `TenantAgentConfig`/
 *   `TenantIntentDefinition[]` 을 받아 동일한 섹션 골격으로 조립한다.
 *
 * 두 빌더는 내부적으로 공통 섹션 헬퍼(예: `buildPaymentGuardSection`,
 * `buildConsentSection`)를 공유한다. GUARDRAIL #1(결제정보)/#3(고지·동의) 헬퍼는
 * agentConfig 를 인자로 받지 않는다 — 테넌트가 구조화 필드로도 우회할 수 없게
 * 원천 차단하기 위함.
 */
import {
  INTENTS,
  INTENT_LABELS,
  type Intent,
  type TenantAgentConfig,
  type TenantIntentDefinition,
} from "@colli/contracts";

/** 프롬프트 빌드 옵션 (모두 선택) */
export interface SystemPromptOptions {
  /** 회사/서비스 표기명 (기본 "BoBi") */
  serviceName?: string;
  /** AI 상담원 이름 (기본 "보비") */
  agentName?: string;
  /**
   * 통화 초입 고지·동의가 이미 처리되었는지(Worker F).
   * false 면 프롬프트에 "먼저 AI+녹음 고지" 지시를 강하게 넣는다.
   */
  consentAlreadyCaptured?: boolean;
  /** 본인확인(lookup_subscriber) 성공 여부 — 조회성 응대 게이트 */
  identityVerified?: boolean;
}

const DEFAULTS = {
  serviceName: "BoBi",
  agentName: "보비",
} as const;

/** 의도 카탈로그를 프롬프트에 넣기 좋은 한 줄 목록으로 렌더 (BoBi 고정 7종). */
function renderIntentCatalog(): string {
  return INTENTS.map(
    (intent: Intent) => `- ${intent} (${INTENT_LABELS[intent]})`,
  ).join("\n");
}

// ── 공유 섹션 헬퍼 ────────────────────────────────────────────────
// buildSystemPrompt/buildTenantSystemPrompt 양쪽이 사용한다. GUARDRAIL #1/#3
// 헬퍼는 의도적으로 agentConfig(또는 그 어떤 테넌트 설정)를 인자로 받지 않는다.

function buildRoleSection(serviceName: string, agentName: string, personaExtra?: string | null): string {
  const lines = [
    `# 역할`,
    `당신은 ${serviceName} 고객센터의 AI 상담원 "${agentName}"입니다.`,
    `${serviceName}는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다.`,
    `전화로 걸려온 ${serviceName} 유료 구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다.`,
    `응대 범위는 ${serviceName}(소프트웨어) 사용 지원에 한정됩니다.`,
  ];
  if (personaExtra) {
    lines.push(personaExtra);
  }
  return lines.join("\n");
}

function buildToneSection(toneExtra?: readonly string[]): string {
  const lines = [
    `# 대화 톤과 방식`,
    `- 친절하고 간결하게, 존댓말로 응대합니다. 장황하게 설명하지 않습니다.`,
    `- 한 번에 하나의 질문만 합니다. 여러 정보를 한꺼번에 묻지 않습니다.`,
    `- 이름·전화번호·날짜 등 중요한 정보는 반드시 복창하여 확인합니다.`,
    `  (예: "010-1234-5678, 맞으실까요?")`,
    `- 복창한 내용을 상대가 정정하면, 그냥 넘어가지 말고 정정된 내용으로 즉시 다시 한번 복창하여 재확인합니다.`,
    `- 상대가 말한 내용을 추측으로 채우지 말고, 불확실하면 되묻습니다.`,
    `- 음성 통화이므로 목록·표·이모지·마크다운을 쓰지 않고 자연스러운 문장으로 말합니다.`,
  ];
  if (toneExtra) {
    for (const extra of toneExtra) {
      lines.push(`- ${extra}`);
    }
  }
  return lines.join("\n");
}

function buildGreetingSection(serviceName: string, agentName: string, greetingText?: string | null): string {
  const greeting = greetingText ?? `안녕하세요, ${serviceName} 고객센터의 AI 상담원 ${agentName}입니다.`;
  return [
    `# 첫 인사 (통화 연결 시 가장 먼저)`,
    `통화가 연결되면 다른 어떤 말보다 먼저 짧게 인사하고 소속을 밝힙니다:`,
    `- "${greeting}"`,
    `그 다음 바로 이어서 본론(고지·용건 파악)으로 들어갑니다.`,
  ].join("\n");
}

/**
 * GUARDRAIL #3(통화 초입 고지·동의) 섹션. 인자는 `consentDone` 플래그 하나뿐 —
 * 테넌트 설정(agentConfig)을 받지 않아 이 섹션 자체를 테넌트가 끌 수 없다.
 * consentDone=true 면 섹션 자체를 생략한다(빈 문자열).
 */
function buildConsentSection(consentDone: boolean): string {
  if (consentDone) return "";
  return [
    `# 통화 시작 고지 (필수)`,
    `첫 인사 직후, 용건을 묻기 전에 다음을 고지하고 동의를 확인합니다:`,
    `- "AI 상담원이 응대하며, 상담 품질을 위해 통화가 녹음됩니다."`,
    `- 고객이 동의하지 않으면 사람 상담원 연결(escalate_to_human, target='cs')로 안내합니다.`,
    `이 고지·동의가 끝나기 전에는 개인정보나 구독 내용을 묻지 않습니다.`,
  ].join("\n");
}

/**
 * GUARDRAIL #4(본인확인) 섹션. 인자는 `identityVerified` 플래그 하나뿐 —
 * 테넌트 설정을 받지 않는다.
 */
function buildIdentitySection(identityVerified: boolean): string {
  return [
    `# 본인확인`,
    identityVerified
      ? `본인확인이 완료된 상태입니다. 필요한 조회를 진행할 수 있습니다.`
      : [
          `개인정보·구독 정보를 조회하기 전에 반드시 본인확인을 먼저 합니다.`,
          `- 가입 시 등록한 전화번호를 여쭙고, 복창하여 확인한 뒤 lookup_subscriber 로 조회합니다.`,
          `- 번호가 매칭되지 않으면(결과 null) 조회를 진행하지 않고, 재확인 또는 사람 인계로 안내합니다.`,
        ].join("\n"),
  ].join("\n");
}

function buildIntentSectionBobi(): string {
  return [
    `# 의도 파악`,
    `고객의 용건을 아래 7가지 중 하나로 파악합니다:`,
    renderIntentCatalog(),
    `- 용건이 모호하면 한 번 더 자연스럽게 되물어 명확히 합니다.`,
    `- 두 번 이상 물어도 의도를 파악하지 못하면 무한 반복하지 말고 콜백 예약(request_callback)으로 마무리합니다.`,
  ].join("\n");
}

function buildToolRulesSectionBobi(): string {
  return [
    `# 처리 방법 (반드시 tool 로만 상태를 변경)`,
    `상태를 바꾸는 모든 행동은 반드시 제공된 tool 호출로만 합니다. 말로 처리했다고 하지 않습니다.`,
    `- 사용법(usage) 문의 → get_kb_answer 로 지식베이스 답변을 찾습니다. 확신이 낮으면 사람 인계나 콜백으로 폴백합니다.`,
    `- 결제(billing) 문의 → send_selfservice_link (kind='billing'). 결제/카드 처리는 음성으로 하지 않습니다.`,
    `- 기술오류(tech_error) → create_ticket 으로 개발팀 처리 티켓을 만듭니다.`,
    `- 업그레이드(upgrade)·해지(churn)·신규가입(new_signup) → route_to_sales 로 영업/리텐션에 인계합니다.`,
    `- 범위를 벗어나거나 민감한 사안 → escalate_to_human 으로 사람에게 인계합니다.`,
    `- 즉시 처리 불가하거나 의도 파악 반복 실패 → request_callback 으로 콜백을 예약합니다.`,
  ].join("\n");
}

/**
 * GUARDRAIL #1(결제정보 음성수집 금지) 섹션. **인자를 받지 않는다** — agentConfig
 * 를 포함해 그 무엇으로도 이 섹션을 끄거나 바꿀 수 없다(불변).
 */
function buildPaymentGuardSection(): string {
  return [
    `# 절대 금지 — 결제정보 음성수집`,
    `카드번호·CVC·유효기간·계좌번호 등 결제수단 정보를 음성으로 묻거나, 받아 적거나, 복창하지 않습니다.`,
    `고객이 말하려 하면 정중히 막고, 결제 변경은 셀프서비스 링크(send_selfservice_link)로만 안내합니다.`,
    `(예: "보안을 위해 카드 정보는 전화로 받지 않습니다. 안전한 결제 링크를 알림톡으로 보내드릴게요.")`,
  ].join("\n");
}

function buildInsuranceGuardSectionBobi(serviceName: string): string {
  return [
    `# 절대 금지 — 보험상품 상담`,
    `보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다.`,
    `당신의 역할은 ${serviceName}(소프트웨어) 지원이지 보험 상담이 아닙니다.`,
    `보험상품 관련 질문이 오면 escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.`,
  ].join("\n");
}

/** "절대 금지 — 업종 특화" 섹션. domainConstraints 배열을 렌더. 비어있으면 생략(빈 문자열). */
function buildDomainConstraintsSection(domainConstraints: readonly string[]): string {
  if (domainConstraints.length === 0) return "";
  return [
    `# 절대 금지 — 업종 특화`,
    ...domainConstraints.map((c) => `- ${c}`),
  ].join("\n");
}

function buildEmotionSection(): string {
  return [
    `# 감정 대응`,
    `- 고객이 화가 났거나 격앙된 경우: 먼저 진심으로 사과하고, 말의 속도를 늦추며 공감합니다.`,
    `- 급한 사안(urgent)이면 우선순위를 높여 빠르게 사람 인계나 콜백으로 연결합니다.`,
    `- 감정이 격해질수록 짧고 분명하게, 해결 지향적으로 응대합니다.`,
  ].join("\n");
}

function buildClosingSection(): string {
  return [
    `# 마무리`,
    `- 처리 결과(티켓 번호·콜백 예약·링크 발송 등)를 간단히 요약해 알립니다.`,
    `- 후속 안내(알림톡)가 발송됨을 알리고 정중히 통화를 마칩니다.`,
  ].join("\n");
}

/**
 * BoBi 상담 system prompt 전문을 조립해 반환한다.
 * 결정론적이므로 동일 옵션 → 동일 출력.
 *
 * ⚠️ 이 함수의 옵션/시그니처/출력은 변경하지 않는다(system-prompt.test.ts 8개가
 * 리팩터 전후 동일 출력을 검증한다).
 */
export function buildSystemPrompt(options: SystemPromptOptions = {}): string {
  const serviceName = options.serviceName ?? DEFAULTS.serviceName;
  const agentName = options.agentName ?? DEFAULTS.agentName;
  const consentDone = options.consentAlreadyCaptured ?? false;
  const identityVerified = options.identityVerified ?? false;

  const sections: string[] = [];

  sections.push(buildRoleSection(serviceName, agentName));
  sections.push(buildToneSection());
  sections.push(buildGreetingSection(serviceName, agentName));

  const consentSection = buildConsentSection(consentDone);
  if (consentSection) sections.push(consentSection);

  sections.push(buildIdentitySection(identityVerified));
  sections.push(buildIntentSectionBobi());
  sections.push(buildToolRulesSectionBobi());
  sections.push(buildPaymentGuardSection());
  sections.push(buildInsuranceGuardSectionBobi(serviceName));
  sections.push(buildEmotionSection());
  sections.push(buildClosingSection());

  return sections.join("\n\n");
}

/**
 * 감정(angry/urgent) 감지 시 system prompt 뒤에 덧붙일 수 있는 짧은 힌트 블록.
 * decideAction 의 감정 태깅 결과와 연동해 런타임에서 프롬프트를 보강할 수 있다.
 */
export function buildEmotionHint(hint: string): string {
  return `# 지금 이 통화 주의\n${hint}`;
}

// ── 신규: 테넌트 일반화 빌더 ─────────────────────────────────────

/** buildTenantSystemPrompt 입력 컨텍스트. */
export interface TenantSystemPromptContext {
  agentConfig: TenantAgentConfig;
  /** 표시 순서(sortOrder)로 정렬된 의도 카탈로그. */
  intents: TenantIntentDefinition[];
  /** 기존 옵션과 동일 의미 — 플랫폼 불변 섹션(GUARDRAIL #3) 트리거. */
  consentAlreadyCaptured?: boolean;
  /** 기존 옵션과 동일 의미 — 플랫폼 불변 섹션(GUARDRAIL #4) 트리거. */
  identityVerified?: boolean;
}

/** 의도 카탈로그를 프롬프트에 넣기 좋은 한 줄 목록으로 렌더 (테넌트 자유 카탈로그). */
function renderTenantIntentCatalog(intents: readonly TenantIntentDefinition[]): string {
  return intents
    .filter((i) => i.enabled)
    .map((i) => `- ${i.key} (${i.label})`)
    .join("\n");
}

function buildIntentSectionTenant(intents: readonly TenantIntentDefinition[]): string {
  const enabledCount = intents.filter((i) => i.enabled).length;
  return [
    `# 의도 파악`,
    `고객의 용건을 아래 ${enabledCount}가지 중 하나로 파악합니다:`,
    renderTenantIntentCatalog(intents),
    `- 용건이 모호하면 한 번 더 자연스럽게 되물어 명확히 합니다.`,
    `- 두 번 이상 물어도 의도를 파악하지 못하면 무한 반복하지 말고 콜백 예약(request_callback)으로 마무리합니다.`,
  ].join("\n");
}

/**
 * 의도 카탈로그의 routingToolName 기반으로 "처리 방법" 안내문을 생성한다.
 * 불변 문구(제목, "반드시 tool 로만" 지시, escalate_to_human/request_callback
 * 안내)는 고정하고, 의도별 라우팅 줄만 카탈로그에서 조립한다.
 */
function buildToolRulesSectionTenant(intents: readonly TenantIntentDefinition[]): string {
  const lines = [
    `# 처리 방법 (반드시 tool 로만 상태를 변경)`,
    `상태를 바꾸는 모든 행동은 반드시 제공된 tool 호출로만 합니다. 말로 처리했다고 하지 않습니다.`,
  ];
  for (const intent of intents) {
    if (!intent.enabled) continue;
    if (intent.routingToolName) {
      lines.push(`- ${intent.key}(${intent.label}) 문의 → ${intent.routingToolName} 을 호출합니다.`);
    } else {
      lines.push(`- ${intent.key}(${intent.label}) 문의 → 상황에 맞는 tool 을 판단해 호출합니다.`);
    }
  }
  lines.push(`- 범위를 벗어나거나 민감한 사안 → escalate_to_human 으로 사람에게 인계합니다.`);
  lines.push(`- 즉시 처리 불가하거나 의도 파악 반복 실패 → request_callback 으로 콜백을 예약합니다.`);
  return lines.join("\n");
}

/**
 * 테넌트 설정(TenantAgentConfig)과 의도 카탈로그(TenantIntentDefinition[])로
 * system prompt 전문을 조립한다. buildSystemPrompt() 와 동일한 섹션 골격을
 * 공유하되, 각 섹션의 본문 텍스트를 ctx 에서 조립한다.
 *
 * GUARDRAIL #1(결제정보)/#3(고지·동의) 섹션은 agentConfig 를 인자로 받지 않는
 * 공유 헬퍼(buildPaymentGuardSection/buildConsentSection)를 그대로 재사용하므로
 * 테넌트가 구조화 필드로도 우회할 수 없다.
 */
export function buildTenantSystemPrompt(ctx: TenantSystemPromptContext): string {
  const { agentConfig, intents } = ctx;
  const consentDone = ctx.consentAlreadyCaptured ?? false;
  const identityVerified = ctx.identityVerified ?? false;

  const sections: string[] = [];

  sections.push(
    buildRoleSection(agentConfig.serviceName, agentConfig.agentName, agentConfig.personaInstructions ?? undefined),
  );
  sections.push(buildToneSection(agentConfig.toneExtra));
  sections.push(
    buildGreetingSection(agentConfig.serviceName, agentConfig.agentName, agentConfig.greetingText),
  );

  const consentSection = buildConsentSection(consentDone);
  if (consentSection) sections.push(consentSection);

  sections.push(buildIdentitySection(identityVerified));
  sections.push(buildIntentSectionTenant(intents));
  sections.push(buildToolRulesSectionTenant(intents));
  sections.push(buildPaymentGuardSection());

  const domainSection = buildDomainConstraintsSection(agentConfig.domainConstraints);
  if (domainSection) sections.push(domainSection);

  sections.push(buildEmotionSection());
  sections.push(buildClosingSection());

  return sections.join("\n\n");
}

// ── 신규: BoBi 디폴트 TenantAgentConfig/의도 카탈로그 ────────────
// buildSystemPrompt() 를 하드코드 없이도 재현할 수 있는 디폴트 값. 다른 워커
// (seed 스크립트 등)가 재사용할 수 있도록 export 한다.

/**
 * BoBi(테넌트 #1) 기본 TenantAgentConfig.
 * docs/tenant-platform-architecture.md §4.2 시드값과 정렬.
 * tenantId 는 실제 DB 조회 전까지 쓰이지 않는 자리이므로 placeholder 브랜드 문자열을 쓴다.
 */
export const BOBI_DEFAULT_AGENT_CONFIG: TenantAgentConfig = {
  tenantId: "bobi-default-tenant" as TenantAgentConfig["tenantId"],
  serviceName: DEFAULTS.serviceName,
  agentName: DEFAULTS.agentName,
  greetingText: null,
  personaInstructions: null,
  toneExtra: [],
  domainConstraints: [
    "보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의 역할은 BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련 질문이 오면 escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다.",
  ],
  intentUnresolvedFallbackTool: "request_callback",
  maxIntentAttempts: 2,
};
