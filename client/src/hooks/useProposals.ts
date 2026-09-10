import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateProposalTokenInput, RejectProposalInput, SubmitProposalInput } from '@shared/schemas';
import type {
  Proposal,
  ProposalApproveResult,
  ProposalListItem,
  ProposalMerge,
  ProposalStatus,
  ProposalToken,
  PublicTokenInfo,
  TreeResponse,
} from '@shared/types';
import { apiFetch } from '../api/client';

export type ProposalFilter = ProposalStatus | 'all';

const PROPOSALS_KEY = ['proposals'] as const;

// --- Administrator (puna lozinka) ---

export function usePendingProposalCount(enabled: boolean) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'count'],
    queryFn: () => apiFetch<{ count: number }>('/api/proposals/count'),
    enabled,
    select: (d) => d.count,
  });
}

export function useProposalList(filter: ProposalFilter, enabled: boolean) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'list', filter],
    queryFn: () =>
      apiFetch<ProposalListItem[]>(filter === 'all' ? '/api/proposals' : `/api/proposals?status=${filter}`),
    enabled,
  });
}

export function useProposal(id: number) {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'detail', id],
    queryFn: () => apiFetch<Proposal>(`/api/proposals/${id}`),
  });
}

export function useProposalTokens() {
  return useQuery({
    queryKey: [...PROPOSALS_KEY, 'tokens'],
    queryFn: () => apiFetch<ProposalToken[]>('/api/proposals/manage/tokens'),
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

  const approve = useMutation({
    mutationFn: ({ id, merges }: { id: number; merges: ProposalMerge[] }) =>
      apiFetch<ProposalApproveResult>(`/api/proposals/${id}/approve`, { method: 'POST', body: { merges } }),
    // I posle konflikta (409) osveži stablo — provera na klijentu tada vidi isto što i server.
    onSettled: () =>
      Promise.all([
        invalidateProposals(),
        queryClient.invalidateQueries({ queryKey: ['tree'] }),
        queryClient.invalidateQueries({ queryKey: ['person'] }),
      ]),
  });

  const reject = useMutation({
    mutationFn: ({ id, review_notes }: { id: number } & RejectProposalInput) =>
      apiFetch(`/api/proposals/${id}/reject`, { method: 'POST', body: { review_notes } }),
    onSuccess: invalidateProposals,
  });

  return { createToken, revokeToken, approve, reject };
}

// --- Saradnik sa pozivnim linkom (bez prijave) ---

export const publicTokenPath = (token: string) => `/api/proposals/public/tokens/${encodeURIComponent(token)}`;

export const publicPhotoUrl = (token: string, photoId: string) =>
  `${publicTokenPath(token)}/photos/${encodeURIComponent(photoId)}`;

/** Link koji administrator šalje rođacima. */
export const inviteUrl = (token: string) => `${window.location.origin}/predlog/${encodeURIComponent(token)}`;

export function usePublicToken(token: string) {
  return useQuery({
    queryKey: ['public-proposal', token, 'info'],
    queryFn: () => apiFetch<PublicTokenInfo>(publicTokenPath(token)),
    retry: false,
    staleTime: 5 * 60_000,
  });
}

export function usePublicTree(token: string, enabled: boolean) {
  return useQuery({
    queryKey: ['public-proposal', token, 'tree'],
    queryFn: () => apiFetch<TreeResponse>(`${publicTokenPath(token)}/tree`),
    enabled,
    retry: false,
    staleTime: 60_000,
  });
}

export function useSubmitProposal(token: string) {
  return useMutation({
    mutationFn: (input: SubmitProposalInput) =>
      apiFetch<{ id: number }>(`${publicTokenPath(token)}/submit`, { method: 'POST', body: input }),
  });
}
