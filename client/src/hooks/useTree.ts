import { useQuery } from '@tanstack/react-query';
import type { TreeResponse } from '@shared/types';
import { apiFetch } from '../api/client';

/** Ceo graf odjednom — pokreće stablo, pretragu, rođendane, timeline i kinship. */
export function useTree() {
  return useQuery({
    queryKey: ['tree'],
    queryFn: () => apiFetch<TreeResponse>('/api/tree'),
    staleTime: 30_000,
  });
}
