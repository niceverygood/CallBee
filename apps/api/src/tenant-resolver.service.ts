/**
 * TenantResolverService — 070 번호 → ResolvedTenantAgentContext 조립.
 *
 * apps/voice 가 인바운드 통화 수신 시 이 서비스를 호출(HTTP 경유,
 * tools.controller.ts 인접 tenants.controller.ts 의 GET /tenants/resolve)해
 * 세션에 바인딩할 system prompt 합성 재료 + tool 목록을 얻는다.
 *
 * Tenant + TenantAgentConfig + TenantIntent[] + TenantTool[] 을 조회해
 * @colli/contracts 의 ResolvedTenantAgentContext shape 로 조립한다.
 * toolSchemas 는 SYSTEM_TOOL_NAMES 전체(kind='system') + enabled 인
 * TenantTool 을 CustomToolJsonSchema 로 변환(kind='custom')한 배열을 병합한다
 * (BuildRuntimeToolListFn 시그니처 구현, 이름 충돌 시 시스템 tool 우선).
 *
 * 순수 클래스 — NestJS 부트스트랩 없이 목 포트로 단위 테스트 가능.
 */
import {
  TOOL_SCHEMA_LIST,
  type TenantId,
  type ResolvedTenantAgentContext,
  type RuntimeToolSchema,
  type BuildRuntimeToolListFn,
  type CustomToolJsonSchema,
  type ToolJsonSchemaBase,
} from "@colli/contracts";
// 프롬프트 조립은 @colli/dialogue 단일 소스만 사용한다(가드레일 섹션이 코드로
// 강제되는 buildTenantSystemPrompt — 여기서 자체 조립/복제 금지).
import { buildTenantSystemPrompt, isWithinBusinessHours } from "@colli/dialogue";
import type {
  TenantRepository,
  TenantAgentConfigRepository,
  TenantIntentRepository,
  CustomToolRepository,
} from "./tenant.ports.js";

export interface TenantResolverDeps {
  tenants: TenantRepository;
  agentConfigs: TenantAgentConfigRepository;
  intents: TenantIntentRepository;
  customTools: CustomToolRepository;
  /**
   * 영업시간 판정(v3)용 현재 시각 주입점 — 테스트 결정성을 위한 옵션.
   * 미지정이면 실제 현재 시각(new Date())을 쓴다.
   */
  now?: () => Date;
}

/**
 * 시스템 tool 카탈로그(항상 전체) + 테넌트 커스텀 tool(enabled 만)을 병합한다.
 * @colli/contracts 의 BuildRuntimeToolListFn 시그니처 구현.
 * 이름 충돌 시 시스템 tool 이 항상 우선(저장 시점 검증이 1차 방어선, 여기가 2차 방어선).
 */
export const buildRuntimeToolList: BuildRuntimeToolListFn = (customTools) => {
  const systemNames = new Set<string>(TOOL_SCHEMA_LIST.map((s) => s.name));
  const systemSchemas: RuntimeToolSchema[] = TOOL_SCHEMA_LIST.map((s) => ({
    ...s,
    kind: "system" as const,
  }));
  const customSchemas: RuntimeToolSchema[] = customTools
    .filter((t) => t.enabled && !systemNames.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description,
      parameters: t.parameters,
      kind: "custom" as const,
    }));
  return [...systemSchemas, ...customSchemas];
};

/** CustomToolDefinition(계약 shape) → LLM 노출 JSON Schema 변환. */
function toCustomToolJsonSchema(t: {
  name: string;
  description: string;
  paramsSchema: { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
}): CustomToolJsonSchema {
  return {
    name: t.name,
    description: t.description,
    parameters: t.paramsSchema,
    kind: "custom",
  };
}

export class TenantResolverService {
  constructor(private readonly deps: TenantResolverDeps) {}

  /**
   * 070 번호(E.164) → 조립된 테넌트 에이전트 컨텍스트. 미매칭이면 null.
   *
   * status === "active" 테넌트만 매칭한다(product-spec §3.3 방어 조건):
   * pending_approval 의 "pending-{slug}" 플레이스홀더는 어차피 실수신 번호와
   * 충돌하지 않지만, suspended(수신 거부)/rejected 테넌트가 실번호를 보유한
   * 채로 통화를 받는 일이 없도록 여기서 차단한다.
   */
  async resolveByPhoneNumber(
    toNumber: string,
  ): Promise<ResolvedTenantAgentContext | null> {
    const tenant = await this.deps.tenants.findByPhoneNumber(toNumber);
    if (!tenant) return null;
    if (tenant.status !== "active") return null;
    return this.resolveByTenantId(tenant.tenantId);
  }

  async resolveByTenantId(
    tenantId: TenantId,
  ): Promise<ResolvedTenantAgentContext | null> {
    const tenant = await this.deps.tenants.findById(tenantId);
    if (!tenant) return null;

    const agentConfig = await this.deps.agentConfigs.get(tenantId);
    if (!agentConfig) return null;

    const intents = await this.deps.intents.list(tenantId);
    const customTools = await this.deps.customTools.list(tenantId);

    const systemNames = new Set<string>(TOOL_SCHEMA_LIST.map((s) => s.name));
    const customBase: Array<ToolJsonSchemaBase & { name: string; enabled: boolean }> =
      customTools.map((t) => ({
        ...toCustomToolJsonSchema(t),
        enabled: t.enabled,
      }));

    const toolSchemas: Array<ToolJsonSchemaBase & { kind: "system" | "custom" }> =
      buildRuntimeToolList(customBase).filter(
        (s) => s.kind === "system" || !systemNames.has(s.name),
      );

    // 완성 시스템 프롬프트(@colli/dialogue 단일 소스). 영업시간(v3) 판정은
    // resolve 시점 = 통화 수신 시점 기준. consent/identity 는 통화 초입이므로
    // 항상 미완료(false) — 기본값 그대로 둔다.
    const now = this.deps.now ? this.deps.now() : new Date();
    const systemPrompt = buildTenantSystemPrompt({
      agentConfig,
      intents,
      isAfterHours: !isWithinBusinessHours(agentConfig.businessHours ?? null, now),
    });

    return {
      tenant,
      agentConfig,
      intents,
      toolSchemas,
      systemPrompt,
    };
  }
}
