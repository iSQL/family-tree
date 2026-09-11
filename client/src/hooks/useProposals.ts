import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProposalTokenInput, EnterBranchInput, SubmitBranchInput } from '@shared/schemas';
import type { BranchChangesResponse, BranchMergeResult, ProposalToken, PublicTokenInfo } from '@shared/types';
import { apiFetch } from '../api/client';

const PROPOSALS_KEY = ['proposals'] as const;

/** Sve što zavisi od sadržaja grane — MutationCache (App.tsx) ga osvežava posle svake izmene. */
export const BRANCH_KEY = ['branch'] as const;

// --- Administrator (pun pristup nad glavnim stablom) ---

export function usePendingProposalCount(enabled: boolean) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'count'],
    queryFn: () => apiFetch<{ count: number }>('/api/proposals/count'),
    enabled,
    select: (d) => d.count,
  });
}

export function useProposalTokens() {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'tokens'],
    queryFn: () => apiFetch<ProposalToken[]>('/api/proposals/manage/tokens'),
  });
}

export function useProposalToken(id: number, enabled: boolean) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'token', id],
    queryFn: () => apiFetch<ProposalToken>(`/api/proposals/manage/tokens/${id}`),
    enabled,
  });
}

export function useTokenChanges(id: number, enabled: boolean) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'changes', id],
    queryFn: () => apiFetch<BranchChangesResponse>(`/api/proposals/manage/tokens/${id}/changes`),
    enabled,
  });
}

export function useProposalAdminMutations() {
  const queryClient = useQueryClient();
  const invalidateProposals = () => queryClient.invalidateQueries({ queryKey: PROPOSALS_KEY });

  const createToken = useMutation({
    mutationFn: (input: CreateProposalTokenInput) =>
      apiFetch<ProposalToken>('/api/proposals/manage/tokens', { method: 'POST', body: input }),
    onSuccess: invalidateProposals,
  });

  const revokeToken = useMutation({
    mutationFn: (id: number) => apiFetch(`/api/proposals/manage/tokens/${id}`, { method: 'DELETE' }),
    onSuccess: invalidateProposals,
  });

  const merge = useMutation({
    mutationFn: ({ tokenId, keys }: { tokenId: number; keys: string[] }) =>
      apiFetch<BranchMergeResult>(`/api/proposals/manage/tokens/${tokenId}/merge`, {
        method: 'POST',
        body: { keys },
      }),
    // I posle konflikta (409) osveži — pregled tada prikazuje trenutno stanje.
    onSettled: () =>
      Promise.all([
        invalidateProposals(),
        queryClient.invalidateQueries({ queryKey: ['tree'] }),
        queryClient.invalidateQueries({ queryKey: ['person'] }),
      ]),
  });

  const discard = useMutation({
    mutationFn: ({ tokenId, keys }: { tokenId: number; keys: string[] }) =>
      apiFetch(`/api/proposals/manage/tokens/${tokenId}/discard`, { method: 'POST', body: { keys } }),
    onSettled: invalidateProposals,
  });

  return { createToken, revokeToken, merge, discard };
}

// --- Saradnik u režimu predloga ---

export function useBranchChanges(enabled: boolean) {
  return useQuery({
    queryKey: [...BRANCH_KEY, 'changes'],
    queryFn: () => apiFetch<BranchChangesResponse>('/api/proposals/branch/changes'),
    enabled,
  });
}

export function useBranchMutations() {
  const queryClient = useQueryClient();

  const discard = useMutation({
    mutationFn: (keys: string[]) => apiFetch('/api/proposals/branch/discard', { method: 'POST', body: { keys } }),
    onSettled: () =>
      Promise.all([
        queryClient.invalidateQueries({ queryKey: BRANCH_KEY }),
        queryClient.invalidateQueries({ queryKey: ['tree'] }),
        queryClient.invalidateQueries({ queryKey: ['person'] }),
      ]),
  });

  const submit = useMutation({
    mutationFn: (input: SubmitBranchInput) =>
      apiFetch('/api/proposals/branch/submit', { method: 'POST', body: input }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['session'] }),
  });

  // Izlazak menja ceo kontekst podataka (grana → glavno stablo) — keš se prazni.
  const exit = useMutation({
    mutationFn: () => apiFetch('/api/auth/exit-branch', { method: 'POST' }),
    onSuccess: () => queryClient.clear(),
  });

  return { discard, submit, exit };
}

// --- Pozivni link (bez prijave) ---

export const publicTokenPath = (token: string) => `/api/proposals/public/tokens/${encodeURIComponent(token)}`;

/** Link koji administrator šalje rođacima. */
export const inviteUrl = (token: string) => `${window.location.origin}/predlog/${encodeURIComponent(token)}`;

export function usePublicToken(token: string) {
  return useQuery({
    queryKey: ['public-proposal', token],
    queryFn: () => apiFetch<PublicTokenInfo>(publicTokenPath(token)),
    retry: false,
  });
}

export function useEnterBranch(token: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: EnterBranchInput) =>
      apiFetch(`${publicTokenPath(token)}/enter`, { method: 'POST', body: input }),
    // Ulazak menja ceo kontekst podataka (glavno stablo → grana) — keš se prazni.
    onSuccess: () => queryClient.clear(),
  });
}
