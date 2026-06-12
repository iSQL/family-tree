import { useQuery } from '@tanstack/react-query';
import type { PersonDetail } from '@shared/types';
import { apiFetch } from '../api/client';

export function usePerson(id: number | null | undefined) {
  return useQuery({
    queryKey: ['person', id],
    queryFn: () => apiFetch<PersonDetail>(`/api/persons/${id}`),
    enabled: id !== null && id !== undefined && Number.isFinite(id),
  });
}
