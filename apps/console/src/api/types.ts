/**
 * 콘솔(테넌트 셀프서비스)이 소비하는 API DTO 타입.
 *
 * 도메인 enum/브랜드ID/테넌트 타입은 오직 `@colli/contracts` 에서 가져온다(로컬 복제 금지).
 * 아래 인터페이스는 apps/api 가 노출해야 하는 "테넌트 스코프 REST 뷰모델"의 형태다.
 * 이 파일이 곧 콘솔-백엔드 통합 계약(엔드포인트별 요청/응답 shape)이다.
 *
 * 기대 엔드포인트(apps/api, 미구현 — 조율 대상):
 *   GET  /tenants/:id                    → TenantSummary
 *   PUT  /tenants/:id                    → TenantSummary
 *   GET  /tenants/:id/agent-config       → TenantAgentConfig
 *   PUT  /tenants/:id/agent-config       → TenantAgentConfig
 *   GET  /tenants/:id/intents            → TenantIntentDefinition[]
 *   POST /tenants/:id/intents            → TenantIntentDefinition
 *   PUT  /tenants/:id/intents/:intentId  → TenantIntentDefinition
 *   DELETE /tenants/:id/intents/:intentId → void
 *   GET  /tenants/:id/tools              → CustomToolDefinition[]
 *   POST /tenants/:id/tools              → CustomToolDefinition
 *   PUT  /tenants/:id/tools/:toolId      → CustomToolDefinition
 *   DELETE /tenants/:id/tools/:toolId    → void
 *   GET  /tenants/:id/kb                 → KnowledgeItem[] (KB 는 v1 apps/admin 과 동일 shape 를 테넌트 스코프로 재사용)
 *   POST /tenants/:id/kb                 → KnowledgeItem
 *   PUT  /tenants/:id/kb/:kbId           → KnowledgeItem
 *   DELETE /tenants/:id/kb/:kbId         → void
 *   POST /onboarding                     → OnboardingResult (목 데이터 — 실제 070 신청 연동은 범위 밖)
 */
import type {
  TenantId,
  TenantSummary,
  TenantAgentConfig,
  TenantIntentDefinition,
  TenantIntentKey,
  CustomToolDefinition,
  JsonSchemaObject,
} from "@colli/contracts";

export type { TenantSummary, TenantAgentConfig, TenantIntentDefinition, CustomToolDefinition };

// ── 온보딩 ──────────────────────────────────────────────────────
export interface OnboardingDraft {
  companyName: string;
  industryLabel: string;
  ownerEmail: string;
  /** 신청 070 번호(목 데이터 — 실제 발급은 범위 밖) */
  requestedPhoneNumber: string;
}

export interface OnboardingResult {
  tenant: TenantSummary;
  /** 신청 접수 메시지(목) */
  message: string;
}

// ── 에이전트 설정 저장용 패치(부분 업데이트) ────────────────────
export type TenantAgentConfigDraft = Omit<TenantAgentConfig, "tenantId">;

// ── 의도 카탈로그 CRUD ──────────────────────────────────────────
export type TenantIntentDraft = Omit<TenantIntentDefinition, "key"> & {
  /** 신규 생성 시에도 사람이 직접 key 를 입력(slug) — 서버가 유일성 검증 */
  key: TenantIntentKey | string;
};

// ── 커스텀 tool CRUD ────────────────────────────────────────────
export interface CustomToolDraft {
  name: string;
  description: string;
  paramsSchema: JsonSchemaObject;
  webhookUrl: string;
  webhookSecret: string;
  timeoutMs: number;
  enabled: boolean;
}

// ── KB(FAQ) — apps/admin 의 KnowledgeItem 과 동일 shape, 테넌트 스코프 재사용 ──
import type { KnowledgeItemId } from "@colli/contracts";

export interface KnowledgeItem {
  id: KnowledgeItemId;
  /** v1 은 TicketCategory(Intent) 였지만 콘솔은 테넌트 자유 의도 key 를 문자열로 받는다 */
  category: string;
  question: string;
  answer: string;
  tags: string[];
  updatedAt: string;
}

export type KnowledgeItemDraft = Omit<KnowledgeItem, "id" | "updatedAt">;

export type { TenantId };
