/**
 * @tanstack/react-query 데이터 훅. UI 는 이 훅들만 사용한다.
 * 소스(fixture/fetch)는 client.ts 의 토글이 결정하므로 훅은 소스에 무관하다.
 */
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "./client";
import type {
  TicketUpdate,
  KnowledgeItemDraft,
} from "./types";

export const qk = {
  metrics: ["metrics"] as const,
  calls: ["calls"] as const,
  call: (id: string) => ["calls", id] as const,
  tickets: ["tickets"] as const,
  callbacks: ["callbacks"] as const,
  kb: ["kb"] as const,
};

export function useMetrics() {
  return useQuery({ queryKey: qk.metrics, queryFn: () => api.getMetrics() });
}

export function useCalls() {
  return useQuery({ queryKey: qk.calls, queryFn: () => api.listCalls() });
}

export function useCall(id: string) {
  return useQuery({
    queryKey: qk.call(id),
    queryFn: () => api.getCall(id),
    enabled: !!id,
  });
}

export function useTickets() {
  return useQuery({ queryKey: qk.tickets, queryFn: () => api.listTickets() });
}

export function useUpdateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: string; patch: TicketUpdate }) =>
      api.updateTicket(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.tickets }),
  });
}

export function useCallbacks() {
  return useQuery({
    queryKey: qk.callbacks,
    queryFn: () => api.listCallbacks(),
  });
}

export function useKb() {
  return useQuery({ queryKey: qk.kb, queryFn: () => api.listKb() });
}

export function useCreateKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (draft: KnowledgeItemDraft) => api.createKb(draft),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb }),
  });
}

export function useUpdateKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      patch,
    }: {
      id: string;
      patch: Partial<KnowledgeItemDraft>;
    }) => api.updateKb(id, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb }),
  });
}

export function useDeleteKb() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.deleteKb(id),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.kb }),
  });
}
