import { useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Person, PersonSlim, TreeResponse, Union, UnionEndReason, UnionType } from '@shared/types';
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

/** Projekcija punog Person reda na PersonSlim (oblik koji živi u keširanom TreeResponse). */
function toSlim(p: Person): PersonSlim {
  return {
    id: p.id,
    first_name: p.first_name,
    last_name: p.last_name,
    maiden_name: p.maiden_name,
    gender: p.gender,
    title: p.title,
    birth_date: p.birth_date,
    death_date: p.death_date,
    photo_id: p.photo_id,
    father_id: p.father_id,
    mother_id: p.mother_id,
  };
}

/**
 * Tačkasto zakrpi keširan ['tree'] umesto refetch-a celog grafa. Velika ušteda na
 * većim stablima: nema mrežnog round-tripa ni ponovnog parsiranja celog TreeResponse;
 * f3 svejedno radi relayout, ali samo to. Ako keš još nije popunjen, no-op (sledeći
 * useTree() povlači sveže). Detalji osoba (['person', id]) su denormalizovani
 * (srodnici), pa njih i dalje invalidiramo — pojedinačni refetch je jeftin.
 */
function patchTree(qc: QueryClient, updater: (tree: TreeResponse) => TreeResponse): void {
  qc.setQueryData<TreeResponse>(['tree'], (prev) => (prev ? updater(prev) : prev));
}

function onErrorToast(err: unknown): void {
  toast.error(err instanceof Error ? err.message : STR.errors.generic);
}

export function useCreatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PersonInput) =>
      apiFetch<Person>('/api/persons', { method: 'POST', body: input }),
    onSuccess: (created) => {
      patchTree(qc, (t) => ({ ...t, persons: [...t.persons, toSlim(created)] }));
      // Roditelji nove osobe dobijaju dete u svom detalju — osveži denormalizaciju.
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.person.created);
    },
    onError: onErrorToast,
  });
}

export function useUpdatePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: PersonPatch }) =>
      apiFetch<Person>(`/api/persons/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (updated) => {
      patchTree(qc, (t) => ({
        ...t,
        persons: t.persons.map((p) => (p.id === updated.id ? toSlim(updated) : p)),
      }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.person.updated);
    },
    onError: onErrorToast,
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/persons/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      // Odraz DB kaskade: FK na deci je ON DELETE SET NULL, a unije sa tom osobom
      // kao partnerom su ON DELETE CASCADE — replikuj oba u kešu.
      patchTree(qc, (t) => ({
        persons: t.persons
          .filter((p) => p.id !== id)
          .map((p) =>
            p.father_id === id || p.mother_id === id
              ? {
                  ...p,
                  father_id: p.father_id === id ? null : p.father_id,
                  mother_id: p.mother_id === id ? null : p.mother_id,
                }
              : p,
          ),
        unions: t.unions.filter((u) => u.partner1_id !== id && u.partner2_id !== id),
      }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.person.deleted);
    },
    onError: onErrorToast,
  });
}

export function useCreateUnion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UnionCreateInput) =>
      apiFetch<Union>('/api/unions', { method: 'POST', body: input }),
    onSuccess: (created) => {
      patchTree(qc, (t) => ({ ...t, unions: [...t.unions, created] }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.union.created);
    },
    onError: onErrorToast,
  });
}

export function useUpdateUnion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: { id: number; patch: UnionPatch }) =>
      apiFetch<Union>(`/api/unions/${id}`, { method: 'PATCH', body: patch }),
    onSuccess: (updated) => {
      patchTree(qc, (t) => ({
        ...t,
        unions: t.unions.map((u) => (u.id === updated.id ? updated : u)),
      }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.union.updated);
    },
    onError: onErrorToast,
  });
}

export function useDeleteUnion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => apiFetch(`/api/unions/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, id) => {
      patchTree(qc, (t) => ({ ...t, unions: t.unions.filter((u) => u.id !== id) }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.union.deleted);
    },
    onError: onErrorToast,
  });
}

export function useUploadPhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ personId, blob }: { personId: number; blob: Blob }) =>
      uploadPhoto(personId, blob),
    onSuccess: ({ photo_id }, { personId }) => {
      patchTree(qc, (t) => ({
        ...t,
        persons: t.persons.map((p) => (p.id === personId ? { ...p, photo_id } : p)),
      }));
      void qc.invalidateQueries({ queryKey: ['person', personId] });
      toast.success(STR.photo.uploaded);
    },
    onError: onErrorToast,
  });
}

export function useDeletePhoto() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (personId: number) =>
      apiFetch(`/api/persons/${personId}/photo`, { method: 'DELETE' }),
    onSuccess: (_data, personId) => {
      patchTree(qc, (t) => ({
        ...t,
        persons: t.persons.map((p) => (p.id === personId ? { ...p, photo_id: null } : p)),
      }));
      void qc.invalidateQueries({ queryKey: ['person', personId] });
      toast.success(STR.photo.removed);
    },
    onError: onErrorToast,
  });
}
