/**
 * Fokusirani prikaz veze između dve osobe: podskup TreeResponse-a sa osobama
 * duž srodničke putanje + drugim roditeljem na svakom roditeljskom koraku,
 * spreman za f3 rendering (glavna osoba = prevoj/zajednički predak, pa se
 * putanja crta kao potomci niz obe grane).
 *
 * Prija/prijatelj (supružnička ivica u SREDINI putanje, apexIndex === null)
 * se namerno ne podržava — f3 crta pretke samo glavne osobe, pa druga strana
 * svadbene veze ne bi bila vidljiva.
 */
import type { TreeResponse } from '../types';
import type { KinshipResult } from './index';

export interface ConnectionView {
  /** Podskup stabla dovoljan za prikaz veze. */
  tree: TreeResponse;
  /** Osoba koju f3 uzima za glavnu — prevoj (zajednički predak). */
  mainId: number;
}

type ConnectionSource = Pick<KinshipResult, 'related' | 'path' | 'apexIndex'>;

/** Da li za rezultat srodstva postoji prikaz veze (gejt za dugme „Prikaži vezu"). */
export function hasConnectionView(result: ConnectionSource): boolean {
  return result.related && result.path.length > 1 && result.apexIndex !== null;
}

export function buildConnectionView(
  tree: TreeResponse,
  result: ConnectionSource,
): ConnectionView | null {
  if (!hasConnectionView(result)) return null;
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const onPath = new Set(result.path);
  const ids = new Set(result.path);

  // Roditeljski korak: ako je jedan roditelj osobe sa putanje i sam na putanji,
  // uključi i drugog roditelja — par tako stoji zajedno u prikazu (toF3
  // ko-roditelje ionako veže kao supružnike).
  for (const id of onPath) {
    const p = byId.get(id);
    if (p === undefined) continue;
    const fatherOnPath = p.father_id !== null && onPath.has(p.father_id);
    const motherOnPath = p.mother_id !== null && onPath.has(p.mother_id);
    if (fatherOnPath && p.mother_id !== null && byId.has(p.mother_id)) ids.add(p.mother_id);
    if (motherOnPath && p.father_id !== null && byId.has(p.father_id)) ids.add(p.father_id);
  }

  const mainId = result.path[result.apexIndex!];
  if (mainId === undefined || !byId.has(mainId)) return null;

  return {
    tree: {
      persons: tree.persons.filter((p) => ids.has(p.id)),
      unions: tree.unions.filter((u) => ids.has(u.partner1_id) && ids.has(u.partner2_id)),
    },
    mainId,
  };
}
