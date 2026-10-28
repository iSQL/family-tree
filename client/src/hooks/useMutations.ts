import { useQueryClient, useMutation, type QueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import type { Person, PersonSlim, TreeResponse, Union, UnionEndReason, UnionType } from '@shared/types';
import type { PersonInput, PersonPatch, UnionPatch } from '@shared/schemas';
import { ApiError, apiFetch, uploadPhoto } from '../api/client';
import { BRANCH_KEY } from './useProposals';
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
    birth_place: p.birth_place,
    photo_id: p.photo_id,
    father_id: p.father_id,
    mother_id: p.mother_id,
    is_family_head: p.is_family_head,
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

function upsertPersonInCache(qc: QueryClient, person: Person): void {
  const slim = toSlim(person);
  patchTree(qc, (t) =>
    t.persons.some((p) => p.id === slim.id)
      ? { ...t, persons: t.persons.map((p) => (p.id === slim.id ? slim : p)) }
      : { ...t, persons: [...t.persons, slim] },
  );
}

/** Odraz DB kaskade pri brisanju osobe: FK na deci je ON DELETE SET NULL, a unije sa
 *  tom osobom kao partnerom su ON DELETE CASCADE — replikuj oba u kešu. */
function removePersonFromCache(qc: QueryClient, id: number): void {
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
}

// ---------------------------------------------------------------------------
// Plan izmena — više povezanih upisa (osobe, veze ka roditeljima, brakovi) kao jedna
// celina: ako bilo koji korak padne, već urađeni koraci se poništavaju. Isti plan
// služi brzom unosu srodnika i vraćanju obrisane osobe/braka („Poništi").
// ---------------------------------------------------------------------------

/** Osoba u planu: postojeća (id) ili nova iz istog plana (key iz `creates`). */
export type PlanRef = { id: number } | { key: string };

export interface PlanCreate {
  key: string;
  input: PersonInput;
  /** Isečena slika — šalje se posle kreiranja; neuspeh ne poništava unos. */
  photo?: Blob | null;
  familyHead?: boolean;
}

/** Upis roditelja POSTOJEĆOJ osobi; izostavljen slot se ne dira, null ga briše. */
export interface PlanLink {
  childId: number;
  father_id?: PlanRef | null;
  mother_id?: PlanRef | null;
}

export interface PlanUnion {
  a: PlanRef;
  b: PlanRef;
  type?: UnionType;
  start_date?: string | null;
  end_date?: string | null;
  end_reason?: UnionEndReason | null;
  notes?: string | null;
}

export interface ChangePlan {
  creates: PlanCreate[];
  links: PlanLink[];
  unions: PlanUnion[];
}

export type UndoStep =
  | { kind: 'deletePerson'; id: number }
  | { kind: 'deleteUnion'; id: number }
  | { kind: 'patchPerson'; id: number; patch: PersonPatch };

export interface PlanResult {
  /** key iz `creates` → id nove osobe. */
  ids: Record<string, number>;
  /** Koraci za poništavanje, redom kojim su izvršeni (izvršavaju se unazad). */
  undo: UndoStep[];
}

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

/** Izvrši korake poništavanja unazad. Već nestali entiteti (404) se preskaču. */
export async function runUndo(qc: QueryClient, steps: readonly UndoStep[]): Promise<void> {
  for (const step of [...steps].reverse()) {
    try {
      if (step.kind === 'deleteUnion') {
        await apiFetch(`/api/unions/${step.id}`, { method: 'DELETE' });
        patchTree(qc, (t) => ({ ...t, unions: t.unions.filter((u) => u.id !== step.id) }));
      } else if (step.kind === 'patchPerson') {
        upsertPersonInCache(
          qc,
          await apiFetch<Person>(`/api/persons/${step.id}`, { method: 'PATCH', body: step.patch }),
        );
      } else {
        await apiFetch(`/api/persons/${step.id}`, { method: 'DELETE' });
        removePersonFromCache(qc, step.id);
      }
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
  void qc.invalidateQueries({ queryKey: ['person'] });
  void qc.invalidateQueries({ queryKey: BRANCH_KEY });
}

/** Izvrši plan: osobe → veze ka roditeljima → brakovi → slike. Greška vraća sve urađeno. */
export async function executePlan(qc: QueryClient, plan: ChangePlan): Promise<PlanResult> {
  const ids: Record<string, number> = {};
  const undo: UndoStep[] = [];
  const resolve = (ref: PlanRef): number => {
    if ('id' in ref) return ref.id;
    const id = ids[ref.key];
    if (id === undefined) throw new Error(STR.errors.generic);
    return id;
  };

  try {
    for (const c of plan.creates) {
      let created = await apiFetch<Person>('/api/persons', { method: 'POST', body: c.input });
      ids[c.key] = created.id;
      undo.push({ kind: 'deletePerson', id: created.id });
      if (c.familyHead) {
        created = await apiFetch<Person>(`/api/persons/${created.id}`, {
          method: 'PATCH',
          body: { is_family_head: true },
        });
      }
      upsertPersonInCache(qc, created);
    }

    for (const l of plan.links) {
      const current = qc.getQueryData<TreeResponse>(['tree'])?.persons.find((p) => p.id === l.childId);
      const patch: PersonPatch = {};
      const prev: PersonPatch = {};
      if (l.father_id !== undefined) {
        patch.father_id = l.father_id === null ? null : resolve(l.father_id);
        prev.father_id = current?.father_id ?? null;
      }
      if (l.mother_id !== undefined) {
        patch.mother_id = l.mother_id === null ? null : resolve(l.mother_id);
        prev.mother_id = current?.mother_id ?? null;
      }
      const updated = await apiFetch<Person>(`/api/persons/${l.childId}`, { method: 'PATCH', body: patch });
      undo.push({ kind: 'patchPerson', id: l.childId, patch: prev });
      upsertPersonInCache(qc, updated);
    }

    for (const u of plan.unions) {
      const { a, b, ...rest } = u;
      const created = await apiFetch<Union>('/api/unions', {
        method: 'POST',
        body: { partner1_id: resolve(a), partner2_id: resolve(b), ...rest },
      });
      undo.push({ kind: 'deleteUnion', id: created.id });
      patchTree(qc, (t) => ({ ...t, unions: [...t.unions, created] }));
    }
  } catch (err) {
    try {
      await runUndo(qc, undo);
    } catch {
      // Vraćanje nije uspelo do kraja — osveži stablo da prikaz odgovara bazi.
      void qc.invalidateQueries({ queryKey: ['tree'] });
    }
    throw err;
  }

  for (const c of plan.creates) {
    const id = ids[c.key];
    if (!c.photo || id === undefined) continue;
    try {
      const { photo_id } = await uploadPhoto(id, c.photo);
      patchTree(qc, (t) => ({
        ...t,
        persons: t.persons.map((p) => (p.id === id ? { ...p, photo_id } : p)),
      }));
    } catch {
      toast.error(STR.quickAdd.photoFailed);
    }
  }

  void qc.invalidateQueries({ queryKey: ['person'] });
  void qc.invalidateQueries({ queryKey: BRANCH_KEY });
  return { ids, undo };
}

/** Brzi unos — izvrši plan; poruku o uspehu (sa „Poništi") prikazuje pozivalac. */
export function useApplyPlan() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (plan: ChangePlan) => executePlan(qc, plan),
    onError: onErrorToast,
  });
}

export function useUndo() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (steps: readonly UndoStep[]) => runUndo(qc, steps),
    onSuccess: () => toast.success(STR.quickAdd.undone),
    onError: onErrorToast,
  });
}

/** Opcije toasta posle brisanja: „Poništi" vraća obrisano kroz isti plan. */
function restoreToast(qc: QueryClient, restore: ChangePlan | undefined) {
  if (!restore) return undefined;
  return {
    duration: 8000,
    action: {
      label: STR.quickAdd.undo,
      onClick: () => {
        executePlan(qc, restore).then(() => toast.success(STR.quickAdd.restored), onErrorToast);
      },
    },
  };
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
    mutationFn: ({ id }: { id: number; restore?: ChangePlan }) =>
      apiFetch(`/api/persons/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, { id, restore }) => {
      removePersonFromCache(qc, id);
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.person.deleted, restoreToast(qc, restore));
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
    mutationFn: ({ id }: { id: number; restore?: ChangePlan }) =>
      apiFetch(`/api/unions/${id}`, { method: 'DELETE' }),
    onSuccess: (_data, { id, restore }) => {
      patchTree(qc, (t) => ({ ...t, unions: t.unions.filter((u) => u.id !== id) }));
      void qc.invalidateQueries({ queryKey: ['person'] });
      toast.success(STR.union.deleted, restoreToast(qc, restore));
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
