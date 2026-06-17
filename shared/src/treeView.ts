/**
 * Logika dubine prikaza stabla — čista, testirana na node-u. Koristi je klijent
 * (Tree.tsx). PRECI se uvek prikazuju u celosti; ograničava se samo broj generacija
 * POTOMAKA oko glavne osobe (family-chart `setProgenyDepth` fizički potkresuje
 * hijerarhiju, pa ovo direktno smanjuje broj iscrtanih čvorova).
 */

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
