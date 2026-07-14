/**
 * Obim izvoza za poster stabla (štampa / PDF) — čista logika nad TreeResponse.
 * Klijent bira šta poster obuhvata; ovde se stablo svodi na taj podskup.
 */
import type { TreeResponse } from './types';
import { descendantFamilyIds, filterTreeToFamily } from './families';

/**
 * Šta poster obuhvata:
 *  - 'view'        → trenutni prikaz stabla (cela loza; broj generacija potomaka seče layout),
 *  - 'lineage'     → cela loza,
 *  - 'ancestors'   → samo preci glavne osobe,
 *  - 'descendants' → samo potomci glavne osobe,
 *  - 'selected'    → ručno izabrani čvorovi,
 *  - 'kinship'     → veza srodstva dve osobe (podskup gradi kinship/connection).
 */
export type PosterScope = 'view' | 'lineage' | 'ancestors' | 'descendants' | 'selected' | 'kinship';

/** Skup id-jeva: glavna osoba + SVI njeni preci (BFS naviše kroz father/mother). */
export function ancestorIds(tree: TreeResponse, mainId: number): Set<number> {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const ids = new Set<number>();
  if (!byId.has(mainId)) return ids;
  const queue = [mainId];
  ids.add(mainId);
  for (let i = 0; i < queue.length; i++) {
    const p = byId.get(queue[i]!)!;
    for (const pid of [p.father_id, p.mother_id]) {
      if (pid === null || !byId.has(pid) || ids.has(pid)) continue;
      ids.add(pid);
      queue.push(pid);
    }
  }
  return ids;
}

/** Podskup stabla ograničen na skup osoba (unions samo ako su oba partnera unutra). */
export function restrictTree(tree: TreeResponse, ids: ReadonlySet<number>): TreeResponse {
  return {
    persons: tree.persons.filter((p) => ids.has(p.id)),
    unions: tree.unions.filter((u) => ids.has(u.partner1_id) && ids.has(u.partner2_id)),
  };
}

/**
 * Stablo svedeno na izabrani obim postera. `selected` važi samo za 'selected'.
 * 'view' vraća celu lozu kao 'lineage' — sečenje po broju generacija potomaka
 * radi layout (f3 progeny_depth), isto kao interaktivno stablo. 'kinship' se
 * ne gradi ovde (podskup daje kinship/connection.buildConnectionView).
 */
export function posterSubtree(
  tree: TreeResponse,
  scope: PosterScope,
  mainId: number,
  selected?: ReadonlySet<number>,
): TreeResponse {
  switch (scope) {
    case 'ancestors':
      return restrictTree(tree, ancestorIds(tree, mainId));
    case 'descendants':
      return restrictTree(tree, descendantFamilyIds(tree, mainId));
    case 'selected':
      return restrictTree(tree, selected ?? new Set([mainId]));
    default:
      return filterTreeToFamily(tree, mainId);
  }
}
