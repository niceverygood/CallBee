/**
 * @tanstack/react-query 데이터 훅. UI 는 이 훅들만 사용한다.
 * 소스(fixture/fetch)는 client.ts 의 토글이 결정하므로 훅은 소스에 무관하다.
 * 모든 훅은 tenantId 를 인자로 받아 쿼리키에 포함한다(멀티테넌트 캐시 격리).
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  TenantSummary,
  TenantAgentConfigDraft,
  TenantIntentDraft,
  CustomToolDraft,
  KnowledgeItemDraft,
} from "./types";
import type { LoginRequest, SignupRequest } from "@colli/contracts";

// ── 로그인 ──────────────────────────────────────────────────────
export function useLogin() {
  return useMutation({
    mutationFn: (req: LoginRequest) => api.login(req),
  });
}

export const qk = {
  tenant: (tenantId: string) => ["tenant", tenantId] as const,
  agentConfig: (tenantId: string) => ["tenant", tenantId, "agent-config"] as const,
  intents: (tenantId: string) => ["tenant", tenantId, "intents"] as const,
  tools: (tenantId: string) => ["tenant", tenantId, "tools"] as const,
  kb: (tenantId: string) => ["tenant", tenantId, "kb"] as const,
  calls: (tenantId: string, limit?: number) =>
    ["tenant", tenantId, "calls", limit ?? "all"] as const,
  call: (tenantId: string, callId: string) =>
    ["tenant", tenantId, "calls", "detail", callId] as const,
};

// ── 가입 위저드(POST /signup) ───────────────────────────────────
export function useSignup() {
  return useMutation({
    mutationFn: (req: SignupRequest) => api.signup(req),
  });
}

// ── 테넌트 요약 ─────────────────────────────────────────────────
export function useTenant(tenantId: string) {
  return useQuery({
    queryKey: qk.tenant(tenantId),
    queryFn: () => api.getTenant(tenantId),
    enabled: !!tenantId,
  });
}

export function useUpdateTenant(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<TenantSummary>) => api.updateTenant(tenantId, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tenant(tenantId) }),
  });
}

// ── 에이전트 설정 ───────────────────────────────────────────────
export function useAgentConfig(tenantId: string) {
  return useQuery({
    queryKey: qk.agentConfig(tenantId),
    queryFn: () => api.getAgentConfig(tenantId),
    enabled: !!tenantId,
  });
}

export function useUpdateAgentConfig(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: TenantAgentConfigDraft) => api.updateAgentConfig(tenantId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.agentConfig(tenantId) }),
  });
}

// ── 의도 카탈로그 ───────────────────────────────────────────────
export function useIntents(tenantId: string) {
  return useQuery({
    queryKey: qk.intents(tenantId),
    queryFn: () => api.listIntents(tenantId),
    enabled: !!tenantId,
  });
}

export function useCreateIntent(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: TenantIntentDraft) => api.createIntent(tenantId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.intents(tenantId) }),
  });
}

export function useUpdateIntent(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ intentId, draft }: { intentId: string; draft: TenantIntentDraft }) =>
      api.updateIntent(tenantId, intentId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.intents(tenantId) }),
  });
}

export function useDeleteIntent(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (intentId: string) => api.deleteIntent(tenantId, intentId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.intents(tenantId) }),
  });
}

// ── 커스텀 tool ─────────────────────────────────────────────────
export function useTools(tenantId: string) {
  return useQuery({
    queryKey: qk.tools(tenantId),
    queryFn: () => api.listTools(tenantId),
    enabled: !!tenantId,
  });
}

export function useCreateTool(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: CustomToolDraft) => api.createTool(tenantId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tools(tenantId) }),
  });
}

export function useUpdateTool(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ toolId, draft }: { toolId: string; draft: CustomToolDraft }) =>
      api.updateTool(tenantId, toolId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tools(tenantId) }),
  });
}

export function useDeleteTool(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (toolId: string) => api.deleteTool(tenantId, toolId),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tools(tenantId) }),
  });
}

// ── 업종 팩 적용 ────────────────────────────────────────────────
// 설정·의도·KB 를 한 번에 만드므로 세 쿼리를 모두 invalidate 한다.
export function useApplyIndustryTemplate(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (industryKey?: string | null) =>
      api.applyIndustryTemplate(tenantId, industryKey),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qk.agentConfig(tenantId) });
      void qc.invalidateQueries({ queryKey: qk.intents(tenantId) });
      void qc.invalidateQueries({ queryKey: qk.kb(tenantId) });
    },
  });
}

// ── KB(FAQ) ─────────────────────────────────────────────────────
export function useKb(tenantId: string) {
  return useQuery({
    queryKey: qk.kb(tenantId),
    queryFn: () => api.listKb(tenantId),
    enabled: !!tenantId,
  });
}

export function useCreateKb(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: KnowledgeItemDraft) => api.createKb(tenantId, draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb(tenantId) }),
  });
}

export function useUpdateKb(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: Partial<KnowledgeItemDraft> }) =>
      api.updateKb(tenantId, id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb(tenantId) }),
  });
}

export function useDeleteKb(tenantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteKb(tenantId, id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb(tenantId) }),
  });
}

// ── 통화 기록 ───────────────────────────────────────────────────
export function useCalls(tenantId: string, opts?: { limit?: number }) {
  return useQuery({
    queryKey: qk.calls(tenantId, opts?.limit),
    queryFn: () => api.listCalls(tenantId, opts),
    enabled: !!tenantId,
  });
}

export function useCall(tenantId: string, callId: string) {
  return useQuery({
    queryKey: qk.call(tenantId, callId),
    queryFn: () => api.getCall(tenantId, callId),
    enabled: !!tenantId && !!callId,
  });
}
