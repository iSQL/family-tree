/**
 * Grupisanje osoba u „porodice" = povezane komponente grafa (roditelj↔dete +
 * supružnik↔supružnik). Čista, testirana logika; klijent je koristi za landing
 * ekran izbora porodice. Predstavnik porodice je najstariji osnivač (root bez
 * roditelja), pa se stablo otvara fokusom na njega.
 */
import type { TreeResponse } from './types';
import { comparePartialDates } from './partialDate';

export interface Family {
  /** Najstariji osnivač (root) — meta fokusa i avatar na kartici. */
  representativeId: number;
  /** Root-supružnik predstavnika (drugi osnivač), za „Marko & Ana"; null ako ga nema. */
  coFounderId: number | null;
  /** Broj članova povezane komponente. */
  size: number;
}

/** Union-find sa kompresijom putanje i sjedinjavanjem po rangu. */
class UnionFind {
  private parent = new Map<number, number>();
  private rank = new Map<number, number>();

  add(x: number): void {
    if (!this.parent.has(x)) {
      this.parent.set(x, x);
      this.rank.set(x, 0);
    }
  }

  find(x: number): number {
    let root = x;
    while (this.parent.get(root) !== root) root = this.parent.get(root)!;
    // kompresija putanje
    let cur = x;
    while (this.parent.get(cur) !== root) {
      const next = this.parent.get(cur)!;
      this.parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return;
    const rankA = this.rank.get(ra)!;
    const rankB = this.rank.get(rb)!;
    if (rankA < rankB) this.parent.set(ra, rb);
    else if (rankA > rankB) this.parent.set(rb, ra);
    else {
      this.parent.set(rb, ra);
      this.rank.set(ra, rankA + 1);
    }
  }
}

/**
 * Sve porodice (povezane komponente), sortirane za prikaz:
 * po veličini opadajuće, pa po starosti predstavnika rastuće, pa po id-u.
 */
type PersonRow = TreeResponse['persons'][number];

/** Sjedini sve osobe u komponente po ivicama roditelj↔dete i supružnik↔supružnik. */
function buildUnionFind(tree: TreeResponse): { uf: UnionFind; byId: Map<number, PersonRow> } {
  const byId = new Map<number, PersonRow>();
  for (const p of tree.persons) byId.set(p.id, p);

  const uf = new UnionFind();
  for (const p of tree.persons) uf.add(p.id);

  // Ivice roditeljstva — samo ka roditelju koji postoji (viseće reference se ignorišu).
  for (const p of tree.persons) {
    if (p.father_id !== null && byId.has(p.father_id)) uf.union(p.id, p.father_id);
    if (p.mother_id !== null && byId.has(p.mother_id)) uf.union(p.id, p.mother_id);
  }
  // Ivice braka.
  for (const u of tree.unions) {
    if (byId.has(u.partner1_id) && byId.has(u.partner2_id)) uf.union(u.partner1_id, u.partner2_id);
  }
  return { uf, byId };
}

/** Skup id-jeva svih članova porodice (povezane komponente) kojoj pripada `personId`. */
export function familyMemberIds(tree: TreeResponse, personId: number): Set<number> {
  const { uf, byId } = buildUnionFind(tree);
  const ids = new Set<number>();
  if (!byId.has(personId)) return ids;
  const root = uf.find(personId);
  for (const p of tree.persons) if (uf.find(p.id) === root) ids.add(p.id);
  return ids;
}

/** Podskup stabla ograničen na porodicu kojoj pripada `personId` (osobe + njihove unije). */
export function filterTreeToFamily(tree: TreeResponse, personId: number): TreeResponse {
  const ids = familyMemberIds(tree, personId);
  return {
    persons: tree.persons.filter((p) => ids.has(p.id)),
    unions: tree.unions.filter((u) => ids.has(u.partner1_id) && ids.has(u.partner2_id)),
  };
}

export function computeFamilies(tree: TreeResponse): Family[] {
  const { uf, byId } = buildUnionFind(tree);

  // Grupisanje članova po korenu komponente.
  const members = new Map<number, number[]>();
  for (const p of tree.persons) {
    const root = uf.find(p.id);
    const list = members.get(root);
    if (list) list.push(p.id);
    else members.set(root, [p.id]);
  }

  // „Root" = osoba bez prisutnog roditelja (null ili viseća referenca).
  const isRoot = (id: number): boolean => {
    const p = byId.get(id)!;
    const hasFather = p.father_id !== null && byId.has(p.father_id);
    const hasMother = p.mother_id !== null && byId.has(p.mother_id);
    return !hasFather && !hasMother;
  };

  // Mapiranje osoba → njeni partneri (za nalaženje root-supružnika).
  const partnersOf = new Map<number, Set<number>>();
  for (const u of tree.unions) {
    if (!byId.has(u.partner1_id) || !byId.has(u.partner2_id)) continue;
    (partnersOf.get(u.partner1_id) ?? partnersOf.set(u.partner1_id, new Set()).get(u.partner1_id)!).add(u.partner2_id);
    (partnersOf.get(u.partner2_id) ?? partnersOf.set(u.partner2_id, new Set()).get(u.partner2_id)!).add(u.partner1_id);
  }

  const families: Family[] = [];
  for (const memberIds of members.values()) {
    const roots = memberIds.filter(isRoot);
    // Predstavnik: najstariji root (komparator stavlja nepoznate datume poslednje),
    // pri izjednačenju najmanji id. Ako (teoretski) nema root-a, uzmi najmanji id.
    const candidates = roots.length > 0 ? roots : memberIds;
    const representativeId = candidates.reduce((best, id) => {
      const cmp = comparePartialDates(byId.get(id)!.birth_date, byId.get(best)!.birth_date);
      if (cmp < 0) return id;
      if (cmp > 0) return best;
      return id < best ? id : best;
    });

    // Su-osnivač: root koji je u braku sa predstavnikom (najmanji id ako ih je više).
    const repPartners = partnersOf.get(representativeId);
    let coFounderId: number | null = null;
    if (repPartners) {
      for (const id of roots) {
        if (id !== representativeId && repPartners.has(id)) {
          if (coFounderId === null || id < coFounderId) coFounderId = id;
        }
      }
    }

    families.push({ representativeId, coFounderId, size: memberIds.length });
  }

  families.sort((a, b) => {
    if (a.size !== b.size) return b.size - a.size; // veće prvo
    const cmp = comparePartialDates(byId.get(a.representativeId)!.birth_date, byId.get(b.representativeId)!.birth_date);
    if (cmp !== 0) return cmp; // stariji prvo
    return a.representativeId - b.representativeId;
  });

  return families;
}
