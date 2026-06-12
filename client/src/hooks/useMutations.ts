import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Person, Union, UnionEndReason, UnionType } from '@shared/types';
import type { PersonInput, PersonPatch, UnionPatch } from '@shared/schemas';
import { apiFetch, uploadPhoto } from '../api/client';
import { STR } from '../lib/strings';

/** Telo POST /api/unions iz ugla klijenta (server kanonizuje redosled partnera). */
export interface UnionCreateInput {
  partner1_id: number;
  partner2_id: number;
  type?: UnionType;
  start_date?: string | null;
  end_date?: string | null;
  end_reason?: UnionEndReason | null;
  notes?: string | null;
}

function useInvalidateGraph() {
  const qc = useQueryClient();
  return async () => {
    await Promise.all([
      qc.invalidateQueries({ queryKey: ['tree'] }),
      qc.invalidateQueries({ queryKey: ['person'] }),
    ]);
  };
}

function onErrorToast(err: unknown): void {
  toast.error(err instanceof Error ? err.message : STR.errors.generic);
}

export function useCreatePerson() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (input: PersonInput) =>
      apiFetch<Person>('/api/persons', { method: 'POST', body: input }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.person.created);
    },
    onError: onErrorToast,
  });
}

export function useUpdatePerson() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PersonPatch }) =>
      apiFetch<Person>(`/api/persons/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.person.updated);
    },
    onError: onErrorToast,
  });
}

export function useDeletePerson() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/persons/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.person.deleted);
    },
    onError: onErrorToast,
  });
}

export function useCreateUnion() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (input: UnionCreateInput) =>
      apiFetch<Union>('/api/unions', { method: 'POST', body: input }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.union.created);
    },
    onError: onErrorToast,
  });
}

export function useUpdateUnion() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UnionPatch }) =>
      apiFetch<Union>(`/api/unions/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.union.updated);
    },
    onError: onErrorToast,
  });
}

export function useDeleteUnion() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/unions/${id}`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.union.deleted);
    },
    onError: onErrorToast,
  });
}

export function useUploadPhoto() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: ({ personId, blob }: { personId: number; blob: Blob }) =>
      uploadPhoto(personId, blob),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.photo.uploaded);
    },
    onError: onErrorToast,
  });
}

export function useDeletePhoto() {
  const invalidate = useInvalidateGraph();
  return useMutation({
    mutationFn: (personId: number) =>
      apiFetch(`/api/persons/${personId}/photo`, { method: 'DELETE' }),
    onSuccess: async () => {
      await invalidate();
      toast.success(STR.photo.removed);
    },
    onError: onErrorToast,
  });
}
