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
  /** Broj članova (komponente za auto, silazne loze za označene). */
  size: number;
  /** true = ručno označena „loza" (glava + potomci + supružnici), ne auto-komponenta. */
  designated: boolean;
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

/**
 * Silazna loza glave: glava + SVI potomci (BFS kroz decu) + supružnici svih njih
 * (da se vide parovi/venčanja). Ne uključuje pretke glave ni rodbinu supružnika.
 */
export function descendantFamilyIds(tree: TreeResponse, headId: number): Set<number> {
  const ids = new Set<number>();
  const present = new Set(tree.persons.map((p) => p.id));
  if (!present.has(headId)) return ids;

  const childrenOf = new Map<number, number[]>();
  for (const p of tree.persons) {
    for (const pid of [p.father_id, p.mother_id]) {
      if (pid === null || !present.has(pid)) continue;
      const list = childrenOf.get(pid);
      if (list) list.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }
  // BFS nadole (glava + potomci).
  const queue = [headId];
  ids.add(headId);
  for (let i = 0; i < queue.length; i++) {
    for (const c of childrenOf.get(queue[i]!) ?? []) {
      if (!ids.has(c)) {
        ids.add(c);
        queue.push(c);
      }
    }
  }
  // Dodaj supružnike sakupljenih (bez daljeg silaska — njihova deca su već potomci).
  for (const u of tree.unions) {
    if (ids.has(u.partner1_id) && present.has(u.partner2_id)) ids.add(u.partner2_id);
    if (ids.has(u.partner2_id) && present.has(u.partner1_id)) ids.add(u.partner1_id);
  }
  return ids;
}

/**
 * Podskup stabla ograničen na porodicu osobe `personId`:
 *  - ako je osoba označena glava (is_family_head) → silazna loza (descendantFamilyIds),
 *  - inače → cela povezana komponenta (familyMemberIds), kao do sada.
 */
export function filterTreeToFamily(tree: TreeResponse, personId: number): TreeResponse {
  const person = tree.persons.find((p) => p.id === personId);
  const ids = person?.is_family_head
    ? descendantFamilyIds(tree, personId)
    : familyMemberIds(tree, personId);
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

  // Dubina potomaka (najduža silazna grana) po osobi — memoizovano, DAG-bezbedno.
  // Najstariji predak ima najdublju lozu; pridošli supružnik na dubokom nivou plitku.
  const childrenOf = new Map<number, number[]>();
  for (const p of tree.persons) {
    for (const pid of [p.father_id, p.mother_id]) {
      if (pid === null || !byId.has(pid)) continue;
      const list = childrenOf.get(pid);
      if (list) list.push(p.id);
      else childrenOf.set(pid, [p.id]);
    }
  }
  const depthMemo = new Map<number, number>();
  const visiting = new Set<number>();
  const descendantDepth = (id: number): number => {
    const cached = depthMemo.get(id);
    if (cached !== undefined) return cached;
    visiting.add(id);
    let d = 0;
    for (const c of childrenOf.get(id) ?? []) {
      if (visiting.has(c)) continue;
      d = Math.max(d, 1 + descendantDepth(c));
    }
    visiting.delete(id);
    depthMemo.set(id, d);
    return d;
  };

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
    // Predstavnik = root sa NAJDUBLJOM lozom potomaka (najviši/najstariji nivo).
    // Datum rođenja je tek sekundarni kriterijum (stariji prvi; nepoznati poslednji),
    // pa najmanji id. Time pridošli supružnik na dubokom nivou ne preuzme porodicu.
    const candidates = roots.length > 0 ? roots : memberIds;
    const representativeId = candidates.reduce((best, id) => {
      const dd = descendantDepth(id) - descendantDepth(best);
      if (dd > 0) return id;
      if (dd < 0) return best;
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

    families.push({ representativeId, coFounderId, size: memberIds.length, designated: false });
  }

  families.sort((a, b) => {
    if (a.size !== b.size) return b.size - a.size; // veće prvo
    const cmp = comparePartialDates(byId.get(a.representativeId)!.birth_date, byId.get(b.representativeId)!.birth_date);
    if (cmp !== 0) return cmp; // stariji prvo
    return a.representativeId - b.representativeId;
  });

  return families;
}

/**
 * Porodice za ekran izbora: ručno označene „loze" (glave) PRVE (sa bedžom), pa
 * automatski prepoznate komponente. Označene glave koje su već auto-predstavnici
 * komponente se preskaču (bez duplikata). Svaka grupa sortirana po veličini.
 */
export function chooserFamilies(tree: TreeResponse): Family[] {
  const auto = computeFamilies(tree);
  const autoRepIds = new Set(auto.map((f) => f.representativeId));

  const partnerLowest = new Map<number, number>();
  for (const u of tree.unions) {
    for (const [a, b] of [
      [u.partner1_id, u.partner2_id],
      [u.partner2_id, u.partner1_id],
    ] as const) {
      const cur = partnerLowest.get(a);
      if (cur === undefined || b < cur) partnerLowest.set(a, b);
    }
  }

  const designated: Family[] = [];
  for (const p of tree.persons) {
    if (!p.is_family_head || autoRepIds.has(p.id)) continue;
    designated.push({
      representativeId: p.id,
      coFounderId: partnerLowest.get(p.id) ?? null,
      size: descendantFamilyIds(tree, p.id).size,
      designated: true,
    });
  }
  designated.sort((a, b) => b.size - a.size || a.representativeId - b.representativeId);

  return [...designated, ...auto];
}
