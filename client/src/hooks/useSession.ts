import { useQuery } from '@tanstack/react-query';
import type { SessionInfo } from '@shared/types';
import { apiFetch } from '../api/client';

export function useSession() {
  return useQuery({
    queryKey: ['session'],
    queryFn: () => apiFetch<SessionInfo>('/api/auth/session'),
    staleTime: Infinity,
    retry: 1,
  });
}
