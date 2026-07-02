/**
 * 테넌트/커스텀tool 포트(어댑터 경계) 인터페이스.
 * GUARDRAIL #6: 외부 의존(Postgres/webhook)은 포트로 감싸 교체 가능하게.
 * 공유 타입은 오직 @colli/contracts 에서 import (로컬 복제 금지).
 *
 * 실인프라(DB 접속/실제 HTTP 콜) 금지 — 이 파일은 인터페이스만 정의한다.
 * 인메모리 구현은 ./adapters/tenant-in-memory.ts, Prisma 구현은
 * ./adapters/tenant-prisma.ts(통합 단계에서 배선)에 둔다.
 */
import type {
  TenantId,
  TenantSummary,
  TenantStatus,
  TenantPlan,
  TenantAgentConfig,
  TenantIntentDefinition,
  TenantIntentKey,
  CustomToolDefinition,
  TenantToolId,
  JsonSchemaObject,
  CallDirection,
  Emotion,
  CallOutcome,
  SpeakerRole,
} from "@colli/contracts";

// ── 테넌트 저장소 ───────────────────────────────────────────────
export interface CreateTenantInput {
  slug: string;
  name: string;
  industryLabel?: string | null;
  phoneNumber: string;
  status?: TenantStatus;
  plan?: TenantPlan;
  ownerEmail?: string | null;
  // ── v3 셀프 가입 필드(전부 optional — 기존 호출부 무수정 동작) ──
  industryKey?: string | null;
  contactPhone?: string | null;
  /** ISO8601 문자열(계약 컨벤션). 어댑터가 Date 로 변환해 저장한다. */
  appliedAt?: string | null;
}

export interface UpdateTenantInput {
  name?: string;
  industryLabel?: string | null;
  phoneNumber?: string;
  status?: TenantStatus;
  plan?: TenantPlan;
  ownerEmail?: string | null;
  // ── v3 승인/반려 플로우 필드 ──
  industryKey?: string | null;
  contactPhone?: string | null;
  appliedAt?: string | null;
  approvedAt?: string | null;
  rejectedAt?: string | null;
  rejectionReason?: string | null;
}

/**
 * 테넌트 CRUD + 070 번호 라우팅 조회. apps/voice 가 인바운드 통화의 수신
 * 번호로 어느 테넌트인지 알아내는 데 findByPhoneNumber 를 쓴다.
 */
export interface TenantRepository {
  create(input: CreateTenantInput): Promise<TenantSummary>;
  findById(tenantId: TenantId): Promise<TenantSummary | null>;
  findBySlug(slug: string): Promise<TenantSummary | null>;
  /** 070 번호(E.164) → 테넌트. apps/voice 인바운드 라우팅 키. */
  findByPhoneNumber(phoneNumber: string): Promise<TenantSummary | null>;
  update(tenantId: TenantId, patch: UpdateTenantInput): Promise<TenantSummary | null>;
  list(): Promise<TenantSummary[]>;
}

// ── 테넌트 에이전트 설정 저장소 ─────────────────────────────────
export type UpsertTenantAgentConfigInput = Omit<TenantAgentConfig, "tenantId">;

export interface TenantAgentConfigRepository {
  get(tenantId: TenantId): Promise<TenantAgentConfig | null>;
  /** 없으면 생성, 있으면 갱신(멱등). */
  upsert(
    tenantId: TenantId,
    input: UpsertTenantAgentConfigInput,
  ): Promise<TenantAgentConfig>;
}

// ── 테넌트 의도 카탈로그 저장소 ─────────────────────────────────
export interface CreateTenantIntentInput {
  key: TenantIntentKey | string;
  label: string;
  keywords?: string[];
  routingToolName?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}

export interface UpdateTenantIntentInput {
  label?: string;
  keywords?: string[];
  routingToolName?: string | null;
  sortOrder?: number;
  enabled?: boolean;
}

export interface TenantIntentRepository {
  create(
    tenantId: TenantId,
    input: CreateTenantIntentInput,
  ): Promise<TenantIntentDefinition>;
  findByKey(
    tenantId: TenantId,
    key: string,
  ): Promise<TenantIntentDefinition | null>;
  /** sortOrder 순으로 정렬됨. */
  list(tenantId: TenantId): Promise<TenantIntentDefinition[]>;
  update(
    tenantId: TenantId,
    key: string,
    patch: UpdateTenantIntentInput,
  ): Promise<TenantIntentDefinition | null>;
  delete(tenantId: TenantId, key: string): Promise<boolean>;
}

// ── 테넌트 커스텀 tool 저장소 ────────────────────────────────────
export interface CreateCustomToolInput {
  name: string;
  description: string;
  paramsSchema: JsonSchemaObject;
  webhookUrl: string;
  /** 평문 시크릿(있으면). 저장 시 hasWebhookSecret 으로만 노출됨. */
  webhookSecret?: string | null;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface UpdateCustomToolInput {
  description?: string;
  paramsSchema?: JsonSchemaObject;
  webhookUrl?: string;
  webhookSecret?: string | null;
  timeoutMs?: number;
  enabled?: boolean;
}

export interface CustomToolRepository {
  create(
    tenantId: TenantId,
    input: CreateCustomToolInput,
  ): Promise<CustomToolDefinition>;
  findByName(
    tenantId: TenantId,
    name: string,
  ): Promise<CustomToolDefinition | null>;
  findById(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<CustomToolDefinition | null>;
  list(tenantId: TenantId): Promise<CustomToolDefinition[]>;
  update(
    tenantId: TenantId,
    toolId: TenantToolId,
    patch: UpdateCustomToolInput,
  ): Promise<CustomToolDefinition | null>;
  delete(tenantId: TenantId, toolId: TenantToolId): Promise<boolean>;
  /**
   * webhook 서명/실행 시 평문 시크릿이 필요한 내부 전용 조회.
   * CustomToolDefinition(계약 shape)은 hasWebhookSecret 불리언만 노출하므로
   * 실제 서명에 필요한 평문은 이 메서드로만 얻는다(실행기 내부 전용).
   */
  getWebhookSecret(
    tenantId: TenantId,
    toolId: TenantToolId,
  ): Promise<string | null>;
}

// ── 테넌트 통화 기록 읽기 저장소 (콘솔 "통화 기록" 화면 전용) ─────
/**
 * apps/admin 의 CallListItem/CallDetail 뷰모델 shape 를 테넌트 스코프로
 * 재사용한다(product-spec §4.9). 차이점: intent 는 테넌트 자유 의도 key 라
 * string|null (BoBi 고정 Intent 유니온이 아님), subscriberName 은 구독자
 * 프로필 연동이 없는 일반 테넌트에서는 항상 null.
 * 전사(text)는 저장 시점에 이미 PII 마스킹된 텍스트다(Transcript 모델 주석).
 */
export interface TenantCallListItem {
  id: string;
  clawOpsCallId: string;
  /** 발신번호(E.164) */
  from: string;
  /** 수신번호(070) */
  to: string;
  direction: CallDirection;
  /** 테넌트 의도 key(자유 문자열) */
  intent: string | null;
  emotion: Emotion | null;
  outcome: CallOutcome | null;
  subscriberId: string | null;
  subscriberName: string | null;
  /** ISO8601 */
  startedAt: string;
  durationSec: number;
}

export interface TenantCallTranscriptSegment {
  role: SpeakerRole;
  /** PII 마스킹된 텍스트 */
  text: string;
  /** 통화 시작 기준 오프셋(초) */
  atSec: number;
}

export interface TenantCallDetail extends TenantCallListItem {
  recordingUrl: string | null;
  summary: string | null;
  transcript: TenantCallTranscriptSegment[];
  /** 이 통화에서 호출된 tool 이름 순서(trace 요약) */
  toolInvocations: string[];
}

export interface ListTenantCallsOptions {
  /** 기본 50, 최대 100 (컨트롤러가 클램프) */
  limit?: number;
  offset?: number;
}

/**
 * CallSession 읽기 전용 포트 — 항상 tenantId 스코프로만 조회한다(격리 강제).
 * 정렬은 startedAt desc(최신순) 고정.
 */
export interface CallSessionReadRepository {
  listByTenant(
    tenantId: TenantId,
    options?: ListTenantCallsOptions,
  ): Promise<TenantCallListItem[]>;
  /** 해당 테넌트 소유가 아니면(타 테넌트 통화) null. */
  findByIdForTenant(
    tenantId: TenantId,
    callId: string,
  ): Promise<TenantCallDetail | null>;
}

// ── webhook tool 실행기 ─────────────────────────────────────────
export interface WebhookInvokeRequest {
  tenantId: TenantId;
  toolName: string;
  webhookUrl: string;
  webhookSecret: string | null;
  timeoutMs: number;
  /** POST body 에 실릴 값들(callSessionId/tenantId/params 조립은 실행기 책임) */
  callSessionId: string | null;
  params: Record<string, unknown>;
}

export type WebhookInvokeResponse =
  | { ok: true; data: unknown }
  | { ok: false; error: { code: string; message: string } };

/**
 * 테넌트 소유 webhook 서버로 POST 하고 응답을 받아오는 포트. 실HTTP 호출은
 * 통합 단계 실구현(예: fetch 기반)에서만 일어난다 — 이 인터페이스와 인메모리
 * 목(성공/실패/타임아웃 시나리오)만 이번 범위에서 구현한다.
 */
export interface WebhookToolInvoker {
  invoke(req: WebhookInvokeRequest): Promise<WebhookInvokeResponse>;
}
