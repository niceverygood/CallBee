/**
 * AI 상담원 설정(agent-config) 화면 공용 draft 훅.
 *
 * 저장은 부분 패치가 아니라 "전체 draft 병합 후 PUT"(기존 패턴 유지 —
 * PUT /tenants/:id/agent-config). 프로필/응대 정책/영업시간/통화/문자 안내
 * 화면이 각자 자기 슬라이스만 편집해도 나머지 필드가 유실되지 않도록,
 * 서버에서 읽은 전체 설정을 draft 로 들고 있다가 통째로 저장한다.
 */
import { useEffect, useState } from "react";
import type { TenantAgentConfig } from "@colli/contracts";
import { useAgentConfig, useUpdateAgentConfig } from "../api/hooks";
import type { TenantAgentConfigDraft } from "../api/types";

export function toDraft(config: TenantAgentConfig): TenantAgentConfigDraft {
  return {
    serviceName: config.serviceName,
    agentName: config.agentName,
    greetingText: config.greetingText,
    personaInstructions: config.personaInstructions,
    toneExtra: [...config.toneExtra],
    domainConstraints: [...config.domainConstraints],
    intentUnresolvedFallbackTool: config.intentUnresolvedFallbackTool,
    maxIntentAttempts: config.maxIntentAttempts,
    // v3 커스텀 확장 — undefined 를 기본값으로 정규화해 draft 를 완전하게 유지
    closingText: config.closingText ?? null,
    businessHours: config.businessHours ?? null,
    afterHoursMode: config.afterHoursMode ?? "callback",
    afterHoursText: config.afterHoursText ?? null,
    transferPhoneNumber: config.transferPhoneNumber ?? null,
    emergencyKeywords: [...(config.emergencyKeywords ?? [])],
    smsSettings: config.smsSettings ?? null,
  };
}

export function emptyAgentConfigDraft(): TenantAgentConfigDraft {
  return {
    serviceName: "",
    agentName: "",
    greetingText: null,
    personaInstructions: null,
    toneExtra: [],
    domainConstraints: [],
    intentUnresolvedFallbackTool: "request_callback",
    maxIntentAttempts: 2,
    closingText: null,
    businessHours: null,
    afterHoursMode: "callback",
    afterHoursText: null,
    transferPhoneNumber: null,
    emergencyKeywords: [],
    smsSettings: null,
  };
}

export function useAgentConfigDraft(tenantId: string) {
  const { data, isLoading, error } = useAgentConfig(tenantId);
  const update = useUpdateAgentConfig(tenantId);

  const [draft, setDraft] = useState<TenantAgentConfigDraft>(emptyAgentConfigDraft());
  const [savedAt, setSavedAt] = useState<number | null>(null);

  useEffect(() => {
    if (data) setDraft(toDraft(data));
  }, [data]);

  const patch = (partial: Partial<TenantAgentConfigDraft>) => {
    setSavedAt(null);
    setDraft((d) => ({ ...d, ...partial }));
  };

  const save = (onSuccess?: () => void) => {
    update.mutate(draft, {
      onSuccess: () => {
        setSavedAt(Date.now());
        onSuccess?.();
      },
    });
  };

  return {
    config: data,
    isLoading,
    error,
    draft,
    patch,
    save,
    saving: update.isPending,
    saveError: update.isError ? update.error : null,
    savedAt,
  };
}
