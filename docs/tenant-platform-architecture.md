# Colli 플랫폼 — 멀티테넌트 아키텍처 (v2)

> **단일 소스:** `@colli/contracts`(`tenant.ts` 신규) + `@colli/db`(`prisma/schema.prisma`).
> 계약 변경은 **Orchestrator 승인 후**에만 전파한다(`CONTRACTS_VERSION` 증가, 현재 `0.2.0`).
> 이 문서는 `/docs/worker-contracts.md`(v1)의 후속이며, v1 문서는 그대로 유지된다 —
> v1 브리핑은 "BoBi 전용 단일테넌트" 관점에서 여전히 유효하고, 이 문서가 "테넌트 #1(BoBi)로
> 흡수 + 멀티테넌트 확장" 관점을 추가한다.

---

## 0. 배경 — 무엇이 왜 바뀌는가

v1은 "BoBi 전용 CS봇"이었다(고정 7개 의도, 고정 8개 tool, 고정 system prompt). v2 요구사항은
"누구나 가입해 자기 업종에 맞는 AI 음성 상담원을 셀프서비스로 빌드하는 멀티테넌트 플랫폼"이다.
BoBi 자신은 이 플랫폼의 **테넌트 #1**이 되고, 기존 동작(가드레일 7종, 7개 의도, 8개 tool,
system prompt)은 "테넌트 #1의 기본 설정값"으로 무손실 이식되어야 한다.

### 채택한 접근 — 3개 제안의 종합

3개 독립 설계안(A: 제네릭 시스템tool+webhook, B: 업종 템플릿+오버라이드, C: 완전 동적 런타임)을
검토한 결과, **앵글 A를 골격으로 채택**하고 앵글 C의 "플랫폼 불변 vs 테넌트 가변" 경계 원칙과
앵글 B의 "구조화 필드 + 코드 합성"(통짜 프롬프트 대신) 아이디어를 결합했다. 앵글 B의 업종
템플릿 마켓플레이스(`IndustryTemplate`, `TemplateIntentPreset` 등)와 앵글 C의 완전 동적 규칙
DSL(`TenantActionRule`, `ConditionExpr` 인터프리터)은 이번 v1 범위에서는 **채택하지 않았다**
(사유는 아래 "기각한 대안과 사유" 참조) — 단, 둘 다 로드맵 확장 지점으로 문서에 남긴다.

**판단 기준과 결과:**

| 기준 | 결과 |
|---|---|
| 구현 난이도 | 앵글 A가 가장 낮음 — 기존 코드를 "옵션 추가"로 확장, "치환"이 아님 |
| 기존 v1 코드/테스트 무손실 이식 | 앵글 A/B 모두 strangler 전략으로 가능. 앵글 C는 `decideAction`/`classifyIntent` 전체를 DSL 인터프리터로 재작성해야 해서 리스크가 큼 |
| 확장성(신규 업종 온보딩) | 앵글 C가 이론상 가장 높지만(코드 배포 없이 가능), 앵글 A도 "커스텀 tool + 구조화 프롬프트 필드"로 실질적으로 동등한 유연성 확보 가능 |
| "완전 커스텀" 요구(프롬프트/의도/tool/KB 4종) 충족도 | tool/KB는 앵글 A가 이미 충분히 충족. 프롬프트/의도는 구조화 필드(앵글 B 스타일)로 보강해 4종 모두 충족 |
| v1 일정 리스크 | 앵글 C는 DSL 인터프리터·ajv 검증·스냅샷 발행 파이프라인 등 신규 개념이 많아 일정 리스크가 가장 큼 |

**결론:** 앵글 A(제네릭 시스템 tool + 테넌트 webhook 커스텀 tool)를 실행 메커니즘의 골격으로,
앵글 C의 "정책(불변) vs 설정(가변)" 명확한 계층 분리를 가드레일 설계 원칙으로, 앵글 B의
"구조화 필드 + 섹션 조립"을 프롬프트 합성 방식으로 채택했다. 업종 템플릿 마켓플레이스와 완전
동적 규칙 DSL은 v1.1+ 로드맵으로 명시적으로 미룬다(아래 §8).

### 기각한 대안과 사유

- **앵글 B의 `IndustryTemplate`/`TemplateIntentPreset`/`TemplateToolPreset` 풀 마켓플레이스**:
  온보딩 마찰을 크게 줄이지만, 업종별 프리셋 큐레이션이 엔지니어링이 아니라 컨텐츠 운영
  부담이라 v1 범위에 넣으면 "완전 커스텀"이라는 핵심 요구사항 구현이 지연된다. 대신 v1은
  "빈 캔버스"(완전 자유 정의)만 지원하고, 템플릿은 v1.1에서 `TenantAgentConfig`/`TenantIntent`/
  `TenantTool`을 복제하는 "즐겨찾기/불러오기" 기능으로 가볍게 재도입할 수 있다(스키마 변경 없이
  애플리케이션 레벨에서 가능).
- **앵글 C의 `TenantActionRule` + `ConditionExpr` 화이트리스트 DSL 인터프리터**: `decideAction`의
  12개 분기(감정 연동, `kbLowConfidence` 폴백, 무한루프 방지 등)를 표현력 있게 재현하려면
  DSL이 계속 커져야 하고, 결국 "안전한 서브셋 스크립팅"으로 수렴할 위험이 있다(설계안 C 스스로도
  인정한 트레이드오프). v1은 `TenantIntent.routingToolName`(의도 1건당 tool 1개 지정)이라는
  훨씬 단순한 라우팅으로 충분히 커버되는 범위만 자동화하고, `decideAction`의 정교한 우선순위
  로직(보험조언 인계, 감정 대응 등)은 **BoBi 전용 코드 경로로 당분간 유지**한다(아래 §5, §6).
- **Prisma `Intent`/`CallOutcome` 등 enum의 즉시 삭제**: 세 제안 모두 "enum→string 전환은
  한번 가면 못 돌아온다"고 경고한다. 이번 단계는 `CallSession.intent`/`Ticket.category`/
  `KnowledgeItem.category` **3개 컬럼만** enum에서 String으로 바꾸고(테넌트 자유 의도를
  저장해야 하는 컬럼), `Intent` enum 타입 자체는 스키마에 유지한다(seed 스크립트·문서·향후
  검증 참조용). `CallOutcome`/`TicketStatus`/`CallbackStatus`/`NotificationStatus`/`Emotion`/
  `SpeakerRole`/`CallDirection`은 업종 불문 플랫폼 상태기계이므로 그대로 둔다.

---

## 1. 데이터 모델

### 1.1 신규 모델 개요 (텍스트 다이어그램)

```
Tenant (1) ──┬── (1) TenantAgentConfig       "system prompt/인사말 합성 재료"
             ├── (N) TenantIntent            "의도 카탈로그(자유 정의)"
             ├── (N) TenantTool               "커스텀 tool(webhook)"
             ├── (N) CallSession ─┬─ (N) Transcript
             │                    ├─ (N) Ticket ── (N) Notification
             │                    ├─ (N) Notification
             │                    ├─ (N) ConsentRecord
             │                    ├─ (N) CallbackRequest
             │                    └─ (N) ToolInvocation
             ├── (N) Ticket                   (tenantId 직접 보유, callSession 옵션)
             ├── (N) KnowledgeItem            "지식베이스(테넌트별 스코프)"
             ├── (N) Notification
             ├── (N) ConsentRecord
             ├── (N) CallbackRequest
             └── (N) ToolInvocation
```

**격리 원칙:** 기존 7개 도메인 테이블(`CallSession`, `Ticket`, `KnowledgeItem`, `Notification`,
`ConsentRecord`, `CallbackRequest`, `ToolInvocation`)에 전부 `tenantId String` FK를 추가했다.
모든 쿼리는 `tenantId` 스코프를 강제해야 한다(apps/api 브리핑 참조) — 이것이 테넌트 격리의
1차 방어선이다.

### 1.2 신규 모델 상세

**`Tenant`** — 입주 업체 1건. `slug`(URL/로그 참조), `name`(표시명), `industryLabel`(자유
텍스트 업종 라벨, 강제 카탈로그 아님 — "식당", "병원" 등 사람이 읽는 메모), `phoneNumber`
(070, ClawOps 라우팅 키, unique), `status`(onboarding/active/suspended), `plan`(trial/starter/
pro/enterprise, 과금 로드맵을 위한 자리 — v1은 강제하지 않음), `ownerEmail`(대시보드 로그인
소유자, 별도 Auth 테이블은 이번 범위 밖).

**`TenantAgentConfig`** — 테넌트별 system prompt/인사말 합성 재료. **설계 결정: 통짜 문자열
저장이 아니라 구조화 필드 + 코드 합성을 채택했다.** 이유는 아래 §3(프롬프트 합성 규칙) 참조.
필드: `serviceName`, `agentName`, `greetingText`(null이면 기본 템플릿 합성), `personaInstructions`
(자유 서술, "# 역할" 섹션에 append), `toneExtra`(문자열 배열, "# 대화 톤과 방식" 섹션에 append),
`domainConstraints`(문자열 배열, "# 절대 금지 — 업종 특화" 섹션으로 렌더 — GUARDRAIL #5의
일반화), `intentUnresolvedFallbackTool`(기본 `"request_callback"`), `maxIntentAttempts`(기본 2).

**`TenantIntent`** — 테넌트별 의도 카탈로그(자유 정의). `key`(테넌트 스코프 유일 slug),
`label`, `keywords`(규칙기반 분류 폴백), `routingToolName`(이 의도를 처리할 tool 이름 —
`SYSTEM_TOOL_NAMES` 중 하나이거나 테넌트가 등록한 `TenantTool.name`, null이면 기본 KB 검색
폴백), `sortOrder`, `enabled`. BoBi(테넌트 #1)는 기존 `INTENTS` 7종을 여기 7행으로 시딩한다
(§4 참조).

**`TenantTool`** — 테넌트별 커스텀 tool(webhook 기반). `name`(LLM function name, 테넌트
스코프 유일), `description`, `paramsSchema`(JSON Schema, OpenAI function-calling `parameters`
형식 그대로), `webhookUrl`, `webhookSecret`(HMAC 서명용, 운영 시 암호화 저장), `timeoutMs`
(기본 8000), `enabled`.

### 1.3 기존 테이블 변경

| 테이블 | 변경 |
|---|---|
| `CallSession` | `tenantId String` + FK 추가. `intent Intent?` → `intent String?`(TenantIntent.key 참조, FK 강제 안 함) |
| `Ticket` | `tenantId String` + FK 추가. `category Intent` → `category String` |
| `KnowledgeItem` | `tenantId String` + FK 추가. `category Intent` → `category String`. `@@index([tenantId, category])` 추가 |
| `Notification` | `tenantId String` + FK 추가 |
| `ConsentRecord` | `tenantId String` + FK 추가 |
| `CallbackRequest` | `tenantId String` + FK 추가 |
| `ToolInvocation` | `tenantId String` + FK 추가. `toolName`은 커스텀 tool일 경우 `"custom:{name}"` 프리픽스 컨벤션으로 시스템 tool과 네임스페이싱 구분(apps/api 컨벤션, DB 레벨 강제 아님) |

`Intent`/`CallOutcome`/`TicketStatus`/`CallbackStatus`/`NotificationStatus`/`Emotion`/
`SpeakerRole`/`CallDirection` enum 자체는 스키마에서 삭제하지 않았다 — `Intent`는 seed 스크립트
및 v1 하위호환 참조용으로 유지, 나머지는 업종 불문 플랫폼 상태기계라 원래부터 변경 대상이 아니다.

### 1.4 검증 상태

`prisma validate`는 **문법·관계 정합성만** 검증했다(라이브 Supabase DB에는 아직 migrate하지
않음 — 이 저장소 지시사항). 실제 마이그레이션 적용 시 아래 순서를 따른다(§6 참조):
1. 신규 테이블(`Tenant`/`TenantAgentConfig`/`TenantIntent`/`TenantTool`) 추가 마이그레이션.
2. 기존 7테이블에 `tenantId`를 nullable로 추가 → BoBi 테넌트 id로 백필 → NOT NULL 전환 (3단계).
3. `CallSession.intent`/`Ticket.category`/`KnowledgeItem.category`의 enum→text 컬럼 타입
   변경(`ALTER COLUMN ... TYPE text USING "column"::text` — 기존 enum 값이 문자열로 그대로
   유효하므로 무손실).

---

## 2. `@colli/contracts` 확장 (`packages/contracts/src/tenant.ts`)

### 2.1 하위호환 원칙

기존 export(`INTENTS`, `Intent`, `INTENT_LABELS`, `TOOL_NAMES`, `ToolName`, `TOOL_SCHEMAS`,
`TOOL_SCHEMA_LIST`, `ToolIO` 등)는 **하나도 삭제·breaking rename하지 않았다**. `pnpm -r test`로
기존 147개 테스트(특히 `packages/dialogue`의 48개)가 무수정으로 통과함을 확인했다(§7 참조).

새로 추가한 별칭:
- `domain.ts`: `BOBI_DEFAULT_INTENTS`(= `INTENTS`), `BoBiDefaultIntent`(= `Intent`) — "이 7종은
  BoBi 기본 카탈로그다"라는 의미를 명시하는 별칭.
- `tools.ts`: `SYSTEM_TOOL_NAMES`(= `TOOL_NAMES`), `SystemToolName`(= `ToolName`) — "이 8종은
  플랫폼이 모든 테넌트에게 기본 제공하는 시스템 tool 카탈로그다"라는 의미를 명시하는 별칭.
- `tools.ts`: `ToolJsonSchemaBase`(name을 좁히지 않은 공용 베이스), 기존 `ToolJsonSchema`는
  이를 확장(`name: ToolName`)하도록 리팩터(값 자체는 변경 없음, 순수 타입 정리).

### 2.2 신규 타입 (`tenant.ts`)

| 타입 | 용도 |
|---|---|
| `TenantId`, `TenantIntentId`, `TenantToolId` | 브랜드형 ID |
| `TenantStatus`, `TenantPlan` | `Tenant.status`/`plan` 과 정렬된 유니온 |
| `TenantSummary` | 테넌트 요약(런타임 조회 결과 shape) |
| `TenantIntentKey` | 브랜드형 문자열 — 테넌트 자유 의도 key |
| `TenantIntentDefinition` | 의도 카탈로그 1건(key/label/keywords/routingToolName/...) |
| `BoBiIntentKey` | `Intent`를 `TenantIntentKey` 자리에 넣기 위한 헬퍼 별칭 |
| `JsonSchemaObject`, `JsonSchemaProperty` | 커스텀 tool paramsSchema 의 제한된 JSON Schema 표현 |
| `CustomToolDefinition` | 테넌트 커스텀 tool 1건(계약 shape, `@colli/db`의 `TenantTool`과 대응) |
| `CustomToolJsonSchema` | `ToolJsonSchemaBase`를 확장 — 커스텀 tool의 LLM 노출 스키마 |
| `TenantAgentConfig` | system prompt 합성 재료(구조화 필드) — `@colli/db`의 `TenantAgentConfig`와 대응 |
| `ResolvedTenantAgentContext` | 콜 수신 시 070→테넌트 조회 후 세션에 바인딩할 최종 조립 결과 |
| `TenantAgentContextResolver` | 위 조립 함수의 시그니처 계약(구현은 apps/api) |
| `TicketCategoryOrTenantIntentKey` | `TicketCategory`(v1) ∪ `TenantIntentKey`(v2) 유니온 — 신규 코드용 |

`tools.ts`에도 런타임 tool 목록 조립 헬퍼 타입을 추가했다:
- `RuntimeToolSchema` = 시스템 tool(`kind:"system"`) ∪ 커스텀 tool(`kind:"custom"`) 판별 유니온.
- `BuildRuntimeToolListFn` — "시스템 tool 카탈로그(항상 전체) + 테넌트 커스텀 tool(enabled만)"을
  병합하는 함수 시그니처. **구현은 apps/api 몫**(아래 워커 브리핑 참조), 여기서는 타입만 고정.

### 2.3 빌드 검증

`pnpm --filter @colli/contracts build` — 통과. `pnpm -r typecheck` — 8개 워크스페이스 전체
통과(`packages/dialogue`, `apps/api`, `apps/voice`, `apps/admin` 포함, 기존 코드 무수정).

---

## 3. 프롬프트 합성 규칙

### 3.1 설계 결정: 구조화 필드 + 코드 합성 (통짜 문자열 저장 아님)

`TenantAgentConfig`는 완성된 system prompt 문자열을 저장하지 않는다. 대신 `packages/dialogue`의
`buildSystemPrompt()`가 가진 **섹션 조립 구조**(역할 → 톤 → 첫인사 → 고지·동의(GUARDRAIL #3,
불변) → 본인확인(GUARDRAIL #4) → 의도 파악 → tool 사용 규칙(GUARDRAIL #2, 불변) → 절대금지:
결제정보(GUARDRAIL #1, 불변) → 절대금지: 업종특화(가변) → 감정 대응 → 마무리)를 그대로 유지하고,
각 섹션의 **본문 텍스트만** `TenantAgentConfig`의 필드에서 주입한다.

**이렇게 결정한 이유:** 통짜 프롬프트 치환을 허용하면 "결제정보 음성수집 금지"·"통화 초입
고지" 같은 불변 섹션도 테넌트가 자유 텍스트로 지워버릴 수 있는 문자열 치환의 일부가 되어버려,
"플랫폼 불변 가드레일은 테넌트가 끌 수 없다"는 요구사항이 코드로 보장되지 않는다. 구조화
필드로 열어주는 지점(역할 설명 추가, 톤 추가, 업종 제약)만 테넌트가 건드릴 수 있게 하고,
GUARDRAIL #1/#2/#3에 대응하는 섹션 생성 함수는 **`TenantAgentConfig`를 인자로 받지 않는
별도 함수**로 분리해 원천적으로 우회 불가능하게 한다.

### 3.2 함수 시그니처 확장 (하위호환)

`packages/dialogue/src/system-prompt.ts`의 기존 `buildSystemPrompt(options: SystemPromptOptions)`
은 **그대로 유지**한다(옵션 전부 optional, 미지정 시 기존 로직 그대로 — `system-prompt.test.ts`
8개 테스트가 무수정 통과해야 함이 성공 기준). 신규 함수 `buildTenantSystemPrompt(ctx)`를 별도
export로 추가한다(구현은 dialogue 워커, 아래 브리핑 참조):

```ts
// packages/dialogue/src/system-prompt.ts (신규 함수, 기존 buildSystemPrompt는 무변경)
export interface TenantSystemPromptContext {
  agentConfig: TenantAgentConfig;        // @colli/contracts 의 신규 타입
  intents: TenantIntentDefinition[];     // 표시 순서(sortOrder)로 정렬됨
  consentAlreadyCaptured?: boolean;      // 기존 옵션과 동일 의미, 플랫폼 불변 섹션 트리거
  identityVerified?: boolean;            // 기존 옵션과 동일 의미
}

export function buildTenantSystemPrompt(ctx: TenantSystemPromptContext): string {
  // 섹션 순서는 buildSystemPrompt() 와 100% 동일한 골격을 재사용(내부에서 섹션별 헬퍼
  // 함수로 리팩터해 buildSystemPrompt/buildTenantSystemPrompt 양쪽이 공유하는 것을 권장).
  // - 역할 섹션: agentConfig.serviceName/agentName/personaInstructions
  // - 톤 섹션: 플랫폼 기본 톤 규칙(고정 문구) + agentConfig.toneExtra append
  // - 첫인사: agentConfig.greetingText ?? 기본 템플릿
  // - 고지·동의(GUARDRAIL #3): consentAlreadyCaptured 로만 분기, agentConfig 인자 없음(불변)
  // - 본인확인(GUARDRAIL #4): identityVerified 로만 분기, agentConfig 인자 없음(불변)
  // - 의도 파악: ctx.intents 순회 렌더(기존 renderIntentCatalog() 를 일반화)
  // - tool 사용 규칙(GUARDRAIL #2): intents[].routingToolName 기반 안내문 생성, 불변 문구는 고정
  // - 절대금지 결제정보(GUARDRAIL #1): 인자 없는 고정 함수, agentConfig 로 끌 수 없음
  // - 절대금지 업종특화: agentConfig.domainConstraints 배열 렌더(비어있으면 섹션 자체 생략 가능)
  // - 감정 대응: 고정 문구(변경 없음)
  // - 마무리: 고정 문구(변경 없음)
}
```

**골든 패리티 검증(필수, dialogue 워커 완료 기준에 포함):** BoBi 시드 데이터(§4)로 채운
`TenantSystemPromptContext`를 `buildTenantSystemPrompt()`에 넣은 출력과, 기존
`buildSystemPrompt({serviceName:"BoBi", agentName:"보비"})`의 출력을 비교해 — 완전히 바이트
동일할 필요는 없지만(의도 렌더 방식이 살짝 다를 수 있음) **모든 GUARDRAIL 섹션 문구가 그대로
포함되어 있는지**를 스냅샷/포함(`toContain`) 테스트로 고정한다. 이것이 "절대 깨지면 안 된다"는
요구사항의 실제 검증 수단이다.

### 3.3 의도 분류/라우팅 일반화

- `classifyIntent(utterance, catalog?: TenantIntentDefinition[])`로 시그니처 확장. `catalog`
  미지정 시 기존 `KEYWORD_MAP`(BoBi 7종) 폴백 — 기존 호출부·`classify-intent.test.ts`
  16개 테스트 무변경 통과. 신규 테넌트는 `TenantIntent.keywords`를 `catalog`로 넘겨 동일
  스코어링 알고리즘(`countMatches`/동점 처리) 재사용.
- `decideAction`(기존 함수, `decide-action.test.ts` 19개 테스트)은 **그대로 둔다** — BoBi의
  정교한 라우팅(감정 연동, 보험상품 인계, `kbLowConfidence` 폴백, `MAX_INTENT_ATTEMPTS`)은
  당분간 BoBi 전용 코드 경로로 유지한다(앵글 C의 DSL 인터프리터를 v1에서 기각한 이유, §0 참조).
  신규 테넌트를 위한 범용 라우팅은 훨씬 단순한 규칙만 지원한다: `TenantIntent.routingToolName`이
  지정되어 있으면 그 tool을 그대로 호출하는 `decideGenericAction(state, intents)` 함수를
  신설한다(파일: `packages/dialogue/src/decide-generic-action.ts`, 신규 테스트 파일 별도).
  이 함수는 `decideAction`의 12개 분기를 재현하지 않는다 — "의도 1건당 tool 1개 직결"이라는
  훨씬 단순한 모델이며, 이것으로 표현 안 되는 복잡한 라우팅이 필요한 테넌트는 v1.1에서
  확장한다(로드맵, §8).

---

## 4. BoBi → 테넌트 #1 마이그레이션 (시드 값 명세)

실제 seed 스크립트 구현은 이번 단계 범위 밖이지만(schema.prisma 코멘트에도 명시), 어떤 값이
들어가는지 아래에 정확히 명세한다. `apps/api` 또는 `packages/db`에 `seed-bobi-tenant.ts`를
작성할 때 이 값을 그대로 사용한다.

### 4.1 `Tenant`

```
slug:          "bobi"
name:          "BoBi"
industryLabel: "보험설계사 SaaS"
phoneNumber:   "07052361037"   // prototypes/clawops-quickstart, .env 의 CLAWOPS_070_NUMBER 와 동일
status:        "active"
plan:          "enterprise"    // 내부 테넌트이므로 제한 없음을 의미하는 값으로 시딩
ownerEmail:    null            // 내부 운영이므로 별도 소유자 계정 없음(v1)
```

### 4.2 `TenantAgentConfig` (1행, tenantId = 위 Tenant.id)

```
serviceName:                  "BoBi"
agentName:                    "보비"
greetingText:                 null   // 기본 템플릿 "안녕하세요, BoBi 고객센터의 AI 상담원 보비입니다." 그대로 사용
personaInstructions:          "BoBi는 보험설계사를 위한 SaaS(구독형 소프트웨어)입니다. 전화로 걸려온
                                BoBi 유료 구독자(보험설계사)의 문의를 실시간 음성으로 응대합니다.
                                응대 범위는 BoBi(소프트웨어) 사용 지원에 한정됩니다."
toneExtra:                    []     // 플랫폼 기본 톤 규칙만으로 기존 문구 재현 충분
domainConstraints:            ["보험상품의 권유·추천·비교·판단·진단성 발언을 하지 않습니다. 당신의
                                역할은 BoBi(소프트웨어) 지원이지 보험 상담이 아닙니다. 보험상품 관련
                                질문이 오면 escalate_to_human 으로 사람(cs 또는 sales)에게 인계합니다."]
                                // 기존 GUARDRAIL #5(system-prompt.ts "절대 금지 — 보험상품 상담" 섹션) 이식
intentUnresolvedFallbackTool: "request_callback"
maxIntentAttempts:            2
```

### 4.3 `TenantIntent` (7행, 기존 `INTENTS`/`INTENT_LABELS`/`classify-intent.ts`의 `KEYWORD_MAP` 그대로 이식)

| key | label | routingToolName | sortOrder |
|---|---|---|---|
| `usage` | 사용법 | `get_kb_answer` | 0 |
| `billing` | 결제 | `send_selfservice_link` | 1 |
| `tech_error` | 기술오류 | `create_ticket` | 2 |
| `upgrade` | 요금제·업그레이드 | `route_to_sales` | 3 |
| `churn` | 해지 | `route_to_sales` | 4 |
| `new_signup` | 신규가입 | `route_to_sales` | 5 |
| `other` | 기타 | `null`(케이스별 판단) | 6 |

`keywords`는 `packages/dialogue/src/classify-intent.ts`의 `KEYWORD_MAP` 상수 값을 그대로
복사한다(seed 작성 시 이 파일에서 export하도록 살짝 수정 필요 — dialogue 워커 브리핑 참조).

### 4.4 `TenantTool` — BoBi는 v1의 8개 시스템 tool을 그대로 쓰므로 신규 행 불필요

**중요한 설계 결정:** BoBi의 8개 tool(`lookup_subscriber` 등)은 `TenantTool`(webhook 기반
커스텀 tool)로 이식하지 **않는다**. 이들은 이미 `apps/api`의 `ToolsService`(`BoBiReadPort` 등
전용 포트로 구현된 네이티브 코드)로 구현되어 있고, `SYSTEM_TOOL_NAMES`(= 기존 `TOOL_NAMES`)로
모든 테넌트에게 항상 제공되는 "플랫폼 시스템 tool 카탈로그"이기 때문이다. webhook으로
우회시키면 지연시간·장애점이 늘고, 이미 검증된 어댑터 경계(`BoBiReadPort`)를 버릴 이유가 없다.
BoBi 테넌트는 `TenantTool` 테이블에 0행을 가지며, 세션 조립 시 시스템 tool 8종이 항상
포함되므로 그대로 기존과 동일하게 동작한다.

### 4.5 `KnowledgeItem`/`CallSession`/`Ticket` 등 기존 데이터 백필

라이브 데이터가 있다면(현재는 실통화 테스트만 진행 중이라 프로덕션 데이터는 없을 가능성이
높음) 마이그레이션 시 전부 `tenantId = <bobi tenant id>`로 백필한다. `KnowledgeItem.category`/
`Ticket.category`/`CallSession.intent`는 기존 `Intent` enum 값(`usage`/`billing`/...)이 문자열
컬럼으로 타입만 바뀌고 값은 그대로 유지되므로 데이터 손실 없음.

---

## 5. Tool 커스텀 실행 흐름 (webhook 시퀀스)

### 5.1 등록 (apps/admin → apps/api)

1. 테넌트 운영자가 대시보드 "Tools" 화면에서 `name`(영문 slug), `description`(한글, LLM 호출
   판단 근거), `paramsSchema`(필드 빌더 UI → JSON Schema 조립, 고급 사용자는 raw JSON), `webhookUrl`,
   `webhookSecret`(선택)을 입력한다.
2. `apps/api`의 `POST /tenants/:tenantId/tools`가 저장 전 검증:
   - `name`이 `SYSTEM_TOOL_NAMES`(8종)와 충돌하지 않는지.
   - `paramsSchema`가 유효한 JSON Schema인지(`type:"object"`, `additionalProperties:false` 강제).
   - `webhookUrl`이 `https://`이고 사설 IP 대역(`10.x`/`172.16-31.x`/`192.168.x`/`127.x`/
     `169.254.x`)이 아닌지(SSRF 방지).
3. 저장 즉시 `TenantTool` 행 생성. 별도 배포/재시작 불필요 — 다음 통화부터 즉시 반영.

### 5.2 실행 (콜 중 LLM이 tool 호출)

```
LLM (voice agent session)
  │  function_call: { name: "check_reservation", arguments: {...} }
  ▼
apps/voice (SessionHandler)
  │  HTTP POST /tools/:name  (기존 v1 경로 그대로)
  ▼
apps/api (ToolsController)
  │  name ∈ SYSTEM_TOOL_NAMES ?
  ├─ 예 → 기존 ToolsService.invoke(name, params)  ── 변경 없음(v1 그대로)
  └─ 아니오 → CustomToolExecutor.invoke(tenantId, name, params, ctx)
                │
                │ 1) TenantTool 조회(tenantId+name), enabled 아니면 즉시 실패
                │ 2) paramsSchema 로 런타임 검증(ajv 등, 실패 시 invalid_params)
                │ 3) body = { tool: name, callSessionId, tenantId, params }
                │ 4) webhookSecret 있으면 HMAC-SHA256 서명 헤더(X-Colli-Signature) 첨부
                │ 5) POST webhookUrl, timeoutMs(기본 8000) 내 응답 대기
                ▼
        테넌트 소유 webhook 서버
                │ 응답: { ok: true, data: <임의 JSON> } | { ok: false, error: {code,message} }
                ▼
apps/api  ── ToolInvocation trace 기록(toolName = "custom:{name}") ──▶ apps/voice ──▶ LLM
```

**타임아웃/실패 처리:** `timeoutMs` 초과 시 플랫폼이 `{ok:false, error:{code:"webhook_timeout"}}`을
합성해 LLM에 반환한다(통화가 무한 대기하지 않도록). 재시도는 하지 않는다(음성 실시간 특성상
1회 시도 후 실패 시 즉시 LLM에 실패를 알려 `request_callback` 등으로 폴백하게 하는 것이 UX상
더 낫다 — 담당 워커가 재시도 정책을 바꾸고 싶으면 Orchestrator 승인 필요).

**Webhook 계약(테넌트에게 문서로 제공할 최소 스펙):**
- 요청: `POST <webhookUrl>`, JSON body `{ tool, callSessionId, tenantId, params }`, 헤더
  `X-Colli-Signature`(HMAC-SHA256, `webhookSecret`로 서명, 있으면 검증 권장).
- 응답: `200 OK`, body `{ ok: true, data: <임의 JSON> }` 또는 `{ ok: false, error: {code, message} }`.
  이 shape가 아니면 `{ok:false, error:{code:"malformed_webhook_response"}}`로 정규화.

### 5.3 왜 webhook인가 (임의 코드 실행 없음)

테넌트 코드는 플랫폼 프로세스 안에서 전혀 실행되지 않는다. 플랫폼은 순수 HTTP 클라이언트
역할만 하므로 샌드박싱/VM/격리 인프라가 불필요하다 — Vapi/Bland/Retell이 실제 프로덕션에서
쓰는 검증된 패턴과 동일하다(앵글 A의 핵심 강점, §0 참조).

---

## 6. BoBi → 테넌트 #1 마이그레이션 단계 (Implement 단계에서 순서대로 수행)

1. **contracts 확장** (완료 — 이 오케스트레이션 단계에서 이미 반영됨): `tenant.ts` 신규,
   `SYSTEM_TOOL_NAMES`/`BOBI_DEFAULT_INTENTS` 별칭 추가. `pnpm --filter @colli/contracts build`
   통과 확인됨.
2. **DB 마이그레이션** (Implement 단계, api 워커): §1.4 순서대로 `prisma migrate dev`로 신규
   테이블 생성 → `tenantId` nullable 추가 → 백필 → NOT NULL 전환 → enum→text 컬럼 타입 변경.
   **주의: 이 오케스트레이션 단계에서는 schema.prisma 파일만 작성했고 실제 migrate는
   실행하지 않았다** — 라이브 Supabase 접속이 아직 미해결 상태이기 때문(지시사항).
3. **BoBi 시드 스크립트 작성 + 실행**(api 또는 db 워커): §4의 값 그대로 `Tenant`/
   `TenantAgentConfig`/`TenantIntent` 7행을 생성하는 `packages/db/prisma/seed-bobi-tenant.ts`
   작성.
4. **packages/dialogue 확장**(dialogue 워커): `buildTenantSystemPrompt`, `classifyIntent`
   catalog 파라미터, `decideGenericAction` 신설. 기존 함수/테스트 무변경 통과가 완료 기준.
5. **apps/api 배선**(api 워커): `TenantResolverPort`, `CustomToolExecutor`,
   `ToolsController` 분기, `POST /tenants/:id/tools` CRUD 엔드포인트.
6. **apps/voice 배선**(voice 워커): `onInitiated`에서 070→테넌트 조회 후
   `ResolvedTenantAgentContext`로 세션 바인딩(현재 `PLACEHOLDER_SYSTEM_PROMPT`/
   `TOOL_SCHEMA_LIST` 고정 주입 제거).
7. **apps/admin 확장**(console 워커): 기존 화면에 `tenantId` 스코프 추가 + 신규 "Tenant
   Settings"(에이전트 설정/의도/tool 편집) 화면.
8. **회귀 검증**: `pnpm -r typecheck` + `pnpm -r test` 전체 그린, BoBi 070 번호(07052361037)로
   실통화 시뮬레이션해 기존과 동일한 인사말/고지/라우팅 확인.

---

## 7. 이번 단계(Orchestrator) 완료 상태

- `packages/db/prisma/schema.prisma`: `Tenant`/`TenantAgentConfig`/`TenantIntent`/`TenantTool`
  신규 모델 + 기존 7테이블에 `tenantId` 추가 + `CallSession.intent`/`Ticket.category`/
  `KnowledgeItem.category`를 `String`으로 일반화. `prisma validate` 통과 확인.
  **라이브 DB에는 migrate하지 않았다**(지시사항).
- `packages/contracts/src/tenant.ts`: 신규 파일, `TenantId`/`TenantSummary`/
  `TenantIntentDefinition`/`CustomToolDefinition`/`TenantAgentConfig`/
  `ResolvedTenantAgentContext` 등 정의.
- `packages/contracts/src/domain.ts`, `tools.ts`, `index.ts`: 하위호환 별칭(`SYSTEM_TOOL_NAMES`,
  `BOBI_DEFAULT_INTENTS`, `ToolJsonSchemaBase`, `RuntimeToolSchema`) 추가, 기존 export 무변경.
  `CONTRACTS_VERSION` 0.1.0 → 0.2.0(non-breaking minor).
- 검증: `pnpm --filter @colli/db exec prisma validate` 통과, `pnpm --filter @colli/contracts build`
  통과, `pnpm -r typecheck`(8개 워크스페이스 전체) 통과, `pnpm -r test`(147개 테스트: dialogue 48
  + api 23 + voice 10 + compliance 48 + notifications 14 + admin 4) 전부 무수정 통과.

---

## 8. 로드맵(v1.1+, 이번 범위 밖)

- **업종 템플릿 마켓플레이스**(앵글 B): `TenantAgentConfig`/`TenantIntent`/`TenantTool`을
  다른 테넌트로부터 "불러오기"하는 애플리케이션 레벨 기능. 스키마 변경 불필요, `sourceTemplateId`
  같은 추적 컬럼만 추가하면 됨.
- **완전 동적 라우팅 DSL**(앵글 C): `decideAction`의 12개 분기 수준 표현력이 필요한 테넌트가
  나타나면, `TenantIntent.routingToolName`(현재의 "의도 1건당 tool 1개") 모델을 벗어나
  `TenantActionRule` + 화이트리스트 `ConditionExpr` 인터프리터를 도입 검토.
- **webhook 신뢰성 보강**: 재시도/서킷브레이커/health check 배치잡(주기적으로 각 `TenantTool`에
  ping해 죽은 tool을 `enabled=false`로 자동 전환).
- **과금/플랜 제한**: `Tenant.plan`에 따른 KB 아이템 개수 상한, 커스텀 tool 개수 상한, 통화량
  과금 — 현재 스키마에 자리(`plan` 필드)만 마련해두었다.
- **카카오 알림톡 템플릿 커스텀**: 현재 `KAKAO_TEMPLATE_KEYS`(5종)는 BoBi 하드코드. 테넌트별
  커스텀 템플릿은 `services/notifications` 확장이 필요해 이번 범위 밖.
