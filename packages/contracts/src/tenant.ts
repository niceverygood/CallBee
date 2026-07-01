/**
 * Colli 플랫폼 — 멀티테넌트 계약 (단일 소스).
 *
 * Colli-BoBi(v1, BoBi 전용 단일테넌트)는 Colli 플랫폼(v2, 셀프서비스 멀티테넌트
 * AI 상담원 빌더)의 "테넌트 #1"로 흡수된다. 이 파일은 v2 에서 신규로 필요한
 * 테넌트/의도/커스텀tool/에이전트설정 타입만 추가한다.
 *
 * ⚠️ 하위호환 규칙:
 * - domain.ts 의 INTENTS(7종)/Intent, tools.ts 의 TOOL_NAMES(8종)/TOOL_SCHEMAS 는
 *   여전히 "BoBi 기본 의도 카탈로그" / "시스템 tool 카탈로그"로 그대로 유지된다.
 *   삭제·breaking rename 하지 않는다 — packages/dialogue 의 48개 테스트가 이
 *   export 들을 직접 참조한다.
 * - 여기 정의된 타입들은 "테넌트가 자유롭게 정의하는 축"(의도 카탈로그, 커스텀
 *   tool, 에이전트 설정)을 표현하는 런타임 계약이다. 컴파일타임 고정 유니온이
 *   아니라 DB(TenantIntent/TenantTool/TenantAgentConfig, @colli/db)에서 로드되는
 *   데이터 shape 라는 점이 domain.ts/tools.ts 의 고정 상수들과 다르다.
 *
 * 플랫폼 불변 가드레일(GUARDRAIL #1 결제정보 음성수집 금지, #2 상태변경은 tool
 * 경유, #3 고지·동의)은 이 파일에 "테넌트가 끌 수 있는 설정"으로 존재하지
 * 않는다 — packages/dialogue 의 system-prompt 빌더 내부에 코드로 하드코드되어
 * TenantAgentConfig 로 우회 불가능하다(자세한 내용은
 * /docs/tenant-platform-architecture.md 참조).
 */
import type { Intent, TicketCategory } from "./domain.js";
import type { SystemToolName, ToolJsonSchemaBase } from "./tools.js";

// ── 브랜드형 ID ─────────────────────────────────────────────────
import type { Brand } from "./domain.js";

export type TenantId = Brand<string, "TenantId">;
export type TenantIntentId = Brand<string, "TenantIntentId">;
export type TenantToolId = Brand<string, "TenantToolId">;

// ── 테넌트 상태/플랜 (Prisma enum 과 1:1 정렬) ──────────────────
export const TENANT_STATUSES = ["onboarding", "active", "suspended"] as const;
export type TenantStatus = (typeof TENANT_STATUSES)[number];

export const TENANT_PLANS = ["trial", "starter", "pro", "enterprise"] as const;
export type TenantPlan = (typeof TENANT_PLANS)[number];

/**
 * 테넌트 요약 shape. @colli/db 의 Tenant 모델과 대응(Prisma 클라이언트 타입을
 * 직접 재노출하지 않고 계약으로 별도 정의 — DB 스키마 변경이 즉시 breaking
 * change 로 전파되지 않도록 완충한다).
 */
export interface TenantSummary {
  tenantId: TenantId;
  slug: string;
  name: string;
  /** 업종 라벨(자유 텍스트, 참고용). 예: "보험설계사 SaaS", "식당", "병원" */
  industryLabel: string | null;
  /** 070 인바운드 라우팅 키(E.164) */
  phoneNumber: string;
  status: TenantStatus;
  plan: TenantPlan;
}

// ── 테넌트별 의도 카탈로그(자유 정의) ───────────────────────────
/**
 * 테넌트가 정의하는 의도 1건. BoBi(테넌트 #1)는 INTENTS(7종)를 그대로 이
 * shape 7건으로 시딩한다(key 는 Intent 값과 동일 문자열).
 *
 * key 는 TenantIntentKey(문자열, 테넌트 스코프 유일) — CallSession.intent /
 * Ticket.category / KnowledgeItem.category 컬럼이 참조하는 값과 동일하다.
 */
export type TenantIntentKey = Brand<string, "TenantIntentKey">;

export interface TenantIntentDefinition {
  key: TenantIntentKey;
  label: string;
  /** classifyIntent 규칙기반 폴백용 키워드 목록 */
  keywords: string[];
  /**
   * 이 의도를 처리할 때 호출할 tool 이름. SYSTEM_TOOL_NAMES 중 하나이거나
   * 테넌트가 등록한 CustomToolDefinition.name. null 이면 get_kb_answer 기본
   * 폴백 등 플랫폼 기본 라우팅을 따른다.
   */
  routingToolName: SystemToolName | string | null;
  sortOrder: number;
  enabled: boolean;
}

/**
 * `Intent`(BoBi 고정 7종)를 `TenantIntentKey`로 취급하기 위한 헬퍼 타입.
 * BoBi 기본 카탈로그 시딩/마이그레이션 코드에서 `Intent` 값을 그대로
 * `TenantIntentKey` 자리에 넣을 때 타입 단언 대신 이 별칭을 사용한다.
 */
export type BoBiIntentKey = Intent;

// ── 테넌트별 커스텀 tool(webhook 기반) ──────────────────────────
/** OpenAI function-calling parameters 형식 JSON Schema(object 최상위 고정) */
export interface JsonSchemaObject {
  type: "object";
  properties: Record<string, JsonSchemaProperty>;
  required?: string[];
  additionalProperties: false;
}

export interface JsonSchemaProperty {
  type: "string" | "number" | "integer" | "boolean" | "array" | "object";
  description?: string;
  enum?: string[];
  items?: JsonSchemaProperty;
}

/**
 * 테넌트가 대시보드에서 등록하는 커스텀 tool 1건 = LLM function 1개.
 * 실행은 apps/api 가 webhookUrl 로 POST 프록시한다(임의 코드 실행 없음).
 * @colli/db 의 TenantTool 모델과 대응.
 */
export interface CustomToolDefinition {
  toolId: TenantToolId;
  tenantId: TenantId;
  /** LLM function name. 테넌트 스코프 유일. SYSTEM_TOOL_NAMES 와 충돌 금지(검증은 apps/api). */
  name: string;
  description: string;
  paramsSchema: JsonSchemaObject;
  webhookUrl: string;
  /** HMAC-SHA256 서명용 시크릿 참조(평문은 여기 타입에 노출하지 않음 — DB/암호화 계층 책임) */
  hasWebhookSecret: boolean;
  timeoutMs: number;
  enabled: boolean;
}

/** apps/api 가 CustomToolDefinition → LLM 에 넘길 JSON Schema 로 변환한 결과 */
export interface CustomToolJsonSchema extends ToolJsonSchemaBase {
  name: string;
  kind: "custom";
}

// ── 테넌트별 에이전트 설정(system prompt/인사말 합성 재료) ─────────
/**
 * @colli/db 의 TenantAgentConfig 모델과 대응. 통짜 프롬프트 문자열이 아니라
 * 구조화 필드다 — buildSystemPrompt() 계열 함수가 이 필드들을 섹션별로
 * 조립하며, GUARDRAIL #1/#3 하드코드 섹션은 이 인터페이스에 필드 자체가
 * 없으므로 테넌트가 원천적으로 건드릴 수 없다.
 */
export interface TenantAgentConfig {
  tenantId: TenantId;
  serviceName: string;
  agentName: string;
  /** null 이면 "안녕하세요, {serviceName} 고객센터의 AI 상담원 {agentName}입니다." 기본 템플릿으로 합성 */
  greetingText: string | null;
  /** "# 역할" 섹션에 자유 서술로 추가되는 업종/서비스 설명 */
  personaInstructions: string | null;
  /** "# 대화 톤과 방식" 섹션에 추가로 append (플랫폼 기본 톤 규칙은 항상 유지) */
  toneExtra: string[];
  /** "# 절대 금지 — 업종 특화" 섹션 렌더 대상(플랫폼 불변 가드와 별개) */
  domainConstraints: string[];
  /** 의도 파악 반복 실패 시 폴백 tool 이름(기본 request_callback) */
  intentUnresolvedFallbackTool: string;
  /** 의도 파악 최대 재시도 횟수 */
  maxIntentAttempts: number;
}

// ── 런타임 조립 결과: 세션에 바인딩할 최종 tool 목록/의도 카탈로그 ──
/**
 * 콜 수신 시 070 번호로 테넌트를 조회한 뒤, 이 shape 하나로 조립해
 * apps/voice 의 세션 핸들러가 LLM 세션(system prompt + tools)에 바인딩한다.
 * 조립 로직(테넌트 조회 → 병합) 자체의 구현은 apps/api·apps/voice 몫이며,
 * 여기서는 그 결과 shape 만 계약으로 고정한다.
 */
export interface ResolvedTenantAgentContext {
  tenant: TenantSummary;
  agentConfig: TenantAgentConfig;
  /** 표시 순서(sortOrder)로 정렬된 의도 카탈로그. BoBi 는 INTENTS 7종이 여기 담긴다. */
  intents: TenantIntentDefinition[];
  /** 시스템 tool(TOOL_SCHEMA_LIST, 항상 전체 포함) + 테넌트 커스텀 tool(enabled 만) 병합 목록 */
  toolSchemas: Array<ToolJsonSchemaBase & { kind: "system" | "custom" }>;
}

/**
 * ResolvedTenantAgentContext 를 만드는 함수의 시그니처 계약(구현은 apps/api,
 * 여기서는 타입만 고정 — apps/voice 는 이 시그니처를 신뢰하고 호출한다).
 */
export type TenantAgentContextResolver = (
  toNumber: string,
) => Promise<ResolvedTenantAgentContext | null>;

// ── TicketCategory / KnowledgeItem.category 일반화 안내 ─────────
/**
 * v1 에서 `TicketCategory = Intent` 였던 별칭은 domain.ts 에 그대로 남아있다
 * (하위호환). v2 신규 코드가 "테넌트 자유 의도 key"를 다뤄야 하는 지점에서는
 * `TicketCategory` 대신 `TenantIntentKey` 를 사용한다. 두 타입 모두 런타임에는
 * 문자열이라 상호 대입 가능하지만, 신규 코드의 의도를 명확히 하기 위해
 * 아래처럼 유니온으로 문서화한다.
 */
export type TicketCategoryOrTenantIntentKey = TicketCategory | TenantIntentKey;
