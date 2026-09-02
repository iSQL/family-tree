/**
 * Logika dubine prikaza stabla — čista, testirana na node-u. Koristi je klijent
 * (Tree.tsx). PRECI se uvek prikazuju u celosti; ograničava se samo broj generacija
 * POTOMAKA oko glavne osobe (family-chart `setProgenyDepth` fizički potkresuje
 * hijerarhiju, pa ovo direktno smanjuje broj iscrtanih čvorova).
 */

import type { TreeResponse } from './types';

/** Iznad ovoliko osoba stablo se podrazumevano otvara ograničeno (perf). */
export const LARGE_TREE_THRESHOLD = 150;
/** Podrazumevani broj generacija potomaka za velika stabla kad korisnik nije zadao svoj. */
export const DEFAULT_PROGENY_DEPTH = 3;

/** Minimum potreban za računanje potomaka — PersonSlim ga zadovoljava. */
interface ParentLink {
  id: number;
  father_id: number | null;
  mother_id: number | null;
}

/**
 * Najveći broj generacija potomaka ispod osobe `rootId` (0 = nema dece).
 * Memoizovana rekurzija — tačno i za DAG (npr. brak među potomcima istog pretka),
 * jer je „dubina ispod čvora" nezavisna od putanje kojom se do njega stiže.
 */
export function maxDescendantDepth(persons: readonly ParentLink[], rootId: number): number {
  const childrenOf = new Map<number, number[]>();
  for (const p of persons) {
    for (const pid of [p.father_id, p.mother_id]) {
      if (pid === null) continue;
      const list = childrenOf.get(pid);
      if (list) list.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }

  const memo = new Map<number, number>();
  const visiting = new Set<number>();
  function depthOf(id: number): number {
    const cached = memo.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    let d = 0;
    for (const c of childrenOf.get(id) ?? []) {
      if (visiting.has(c)) continue; // zaštita od (nepostojećih) ciklusa
      d = Math.max(d, 1 + depthOf(c));
    }
    visiting.delete(id);
    memo.set(id, d);
    return d;
  }
  return depthOf(rootId);
}

/** Glavna osoba + svi njeni preci — čvorovi koji se nikad ne skrivaju. */
export function collectProtectedIds(tree: TreeResponse, mainId: number): Set<number> {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const out = new Set<number>();
  const stack = [mainId];
  while (stack.length > 0) {
    const id = stack.pop()!;
    if (out.has(id)) continue;
    out.add(id);
    const p = byId.get(id);
    if (!p) continue;
    if (p.father_id !== null) stack.push(p.father_id);
    if (p.mother_id !== null) stack.push(p.mother_id);
  }
  return out;
}

/**
 * Grana za skrivanje: osoba + supružnici (iz brakova) + svi potomci, rekurzivno
 * sa njihovim supružnicima. Glavna osoba i njeni preci su zaštićeni — za njih
 * vraća null, a obilazak ih preskače i kad ih dotakne (npr. preko braka).
 */
export function collectBranchIds(
  tree: TreeResponse,
  rootId: number,
  mainId: number,
): number[] | null {
  if (!tree.persons.some((p) => p.id === rootId)) return null;
  const protectedIds = collectProtectedIds(tree, mainId);
  if (protectedIds.has(rootId)) return null;

  const childrenOf = new Map<number, number[]>();
  for (const p of tree.persons) {
    for (const pid of [p.father_id, p.mother_id]) {
      if (pid === null) continue;
      const list = childrenOf.get(pid);
      if (list) list.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }
  const spousesOf = new Map<number, number[]>();
  for (const u of tree.unions) {
    for (const [a, b] of [
      [u.partner1_id, u.partner2_id],
      [u.partner2_id, u.partner1_id],
    ] as const) {
      const list = spousesOf.get(a);
      if (list) list.push(b);
      else spousesOf.set(a, [b]);
    }
  }

  const branch = new Set<number>();
  const queue = [rootId];
  while (queue.length > 0) {
    const id = queue.pop()!;
    if (branch.has(id) || protectedIds.has(id)) continue;
    branch.add(id);
    queue.push(...(childrenOf.get(id) ?? []), ...(spousesOf.get(id) ?? []));
  }
  return [...branch];
}

/**
 * Ukloni skrivene osobe iz prikaza stabla (samo view — podaci ostaju netaknuti).
 * Brakovi koji dodiruju skrivenu osobu se izbacuju; viseće roditeljske reference
 * (father_id/mother_id ka skrivenoj osobi) toF3 ionako preskače, pa grana koja je
 * povezana samo preko skrivene osobe prirodno nestaje iz iscrtane komponente.
 */
export function hidePersonsFromTree(tree: TreeResponse, hidden: ReadonlySet<number>): TreeResponse {
  if (hidden.size === 0) return tree;
  return {
    persons: tree.persons.filter((p) => !hidden.has(p.id)),
    unions: tree.unions.filter(
      (u) => !hidden.has(u.partner1_id) && !hidden.has(u.partner2_id),
    ),
  };
}

/** Validna eksplicitna dubina je ceo broj ≥ 0; sve ostalo → undefined. */
function normalizeDepth(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * Efektivni broj generacija potomaka, uvek konkretan broj ograničen na `maxProgeny`:
 *  - eksplicitna vrednost (iz URL-a) pobeđuje, ali se kratko na max;
 *  - bez nje: malo stablo → svi potomci (= max), veliko → podrazumevani (kratko na max).
 */
export function resolveProgenyDepth(
  personCount: number,
  downParam: number | null | undefined,
  maxProgeny: number,
): number {
  const explicit = normalizeDepth(downParam);
  if (explicit !== undefined) return Math.min(explicit, maxProgeny);
  if (personCount <= LARGE_TREE_THRESHOLD) return maxProgeny;
  return Math.min(DEFAULT_PROGENY_DEPTH, maxProgeny);
}
