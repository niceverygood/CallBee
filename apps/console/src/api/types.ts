/**
 * 콘솔(사업장 셀프서비스)이 소비하는 API DTO 타입.
 *
 * 도메인 enum/브랜드ID/사업장 타입은 오직 `@colli/contracts` 에서 가져온다(로컬 복제 금지).
 * 아래 인터페이스는 apps/api 가 노출하는 "사업장 스코프 REST 뷰모델"의 형태다.
 * 이 파일이 곧 콘솔-백엔드 통합 계약(엔드포인트별 요청/응답 shape)이다.
 *
 * 소비 엔드포인트(apps/api):
 *   POST /signup                          → SignupResult (공개, 무인증 — 가입 위저드)
 *   POST /auth/login                      → LoginResponse
 *   POST /auth/kakao/callback             → LoginResponse
 *   GET  /tenants/:id                     → TenantSummary
 *   PUT  /tenants/:id                     → TenantSummary
 *   GET  /tenants/:id/agent-config        → TenantAgentConfig
 *   PUT  /tenants/:id/agent-config        → TenantAgentConfig (v3 신규 7필드 포함)
 *   GET  /tenants/:id/intents             → TenantIntentDefinition[]
 *   POST /tenants/:id/intents             → TenantIntentDefinition
 *   PUT  /tenants/:id/intents/:intentId   → TenantIntentDefinition
 *   DELETE /tenants/:id/intents/:intentId → void
 *   GET  /tenants/:id/tools               → CustomToolDefinition[]
 *   POST /tenants/:id/tools               → CustomToolDefinition
 *   PUT  /tenants/:id/tools/:toolId       → CustomToolDefinition
 *   DELETE /tenants/:id/tools/:toolId     → void
 *   GET  /tenants/:id/kb                  → KnowledgeItem[]
 *   POST /tenants/:id/kb                  → KnowledgeItem
 *   PUT  /tenants/:id/kb/:kbId            → KnowledgeItem
 *   DELETE /tenants/:id/kb/:kbId          → void
 *   POST /tenants/:id/industry-template   → ApplyIndustryTemplateResult (업종 팩 적용)
 *   GET  /tenants/:id/calls?limit&offset  → TenantCallListItem[] (v3 신규)
 *   GET  /tenants/:id/calls/:callId       → TenantCallDetail    (v3 신규)
 */
import type {
  TenantId,
  TenantSummary,
  TenantAgentConfig,
  TenantIntentDefinition,
  TenantIntentKey,
  CustomToolDefinition,
  JsonSchemaObject,
  CallSessionId,
  CallDirection,
  CallOutcome,
  SpeakerRole,
} from "@colli/contracts";

export type { TenantSummary, TenantAgentConfig, TenantIntentDefinition, CustomToolDefinition };

// ── 에이전트 설정 저장용 draft(전체 병합 후 PUT — 부분 패치 아님) ──
export type TenantAgentConfigDraft = Omit<TenantAgentConfig, "tenantId">;

// ── 문의 유형(의도) CRUD ────────────────────────────────────────
export type TenantIntentDraft = Omit<TenantIntentDefinition, "key"> & {
  /** 신규 생성 시에도 사람이 직접 key 를 입력(slug) — 서버가 유일성 검증 */
  key: TenantIntentKey | string;
};

// ── 연동(커스텀 tool) CRUD ──────────────────────────────────────
export interface CustomToolDraft {
  name: string;
  description: string;
  paramsSchema: JsonSchemaObject;
  webhookUrl: string;
  webhookSecret: string;
  timeoutMs: number;
  enabled: boolean;
}

// ── 자주 묻는 질문(KB) — apps/admin 의 KnowledgeItem 과 동일 shape, 사업장 스코프 재사용 ──
import type { KnowledgeItemId } from "@colli/contracts";

export interface KnowledgeItem {
  id: KnowledgeItemId;
  /** v1 은 TicketCategory(Intent) 였지만 콘솔은 사업장 자유 의도 key 를 문자열로 받는다 */
  category: string;
  question: string;
  answer: string;
  tags: string[];
  /**
   * false = "답변을 채우고 켜기 전" 상태 — 통화 검색에서 제외된다.
   * 업종 팩이 만드는 예시 질문이 이 상태로 생성된다(답변 입력 후 직접 켠다).
   */
  enabled: boolean;
  updatedAt: string;
}

export type KnowledgeItemDraft = Omit<KnowledgeItem, "id" | "updatedAt">;

// ── 통화 기록(사업장 스코프) — apps/admin CallListItem/CallDetail shape 재사용,
//    intent 만 자유 문자열(사업장 문의 유형 key)로 일반화(product-spec §4.9) ──
export interface TenantCallListItem {
  id: CallSessionId;
  /** 발신번호(E.164) — 목록 표기는 UI 에서 maskPhone 으로 마스킹 */
  from: string;
  /** 수신번호(070) */
  to: string;
  direction: CallDirection;
  /** 사업장 문의 유형 key(자유 문자열). 미분류면 null */
  intent: string | null;
  outcome: CallOutcome | null;
  /** ISO8601 */
  startedAt: string;
  durationSec: number;
}

export interface TranscriptSegment {
  role: SpeakerRole;
  text: string;
  /** 통화 시작 기준 오프셋(초) */
  atSec: number;
}

export interface TenantCallDetail extends TenantCallListItem {
  /** 녹취 접근 URL(서명형). 없으면 재생 자리만 표시 */
  recordingUrl: string | null;
  /** AI 요약 */
  summary: string | null;
  /** 마스킹된 전사 텍스트 */
  transcript: TranscriptSegment[];
  /** 이 통화에서 호출된 tool 이름 순서 */
  toolInvocations: string[];
}

export type { TenantId };
