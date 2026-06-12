/**
 * Izgradnja pomoćnih mapa nad TreeResponse za kalkulator srodstva.
 * Čisto, bez I/O.
 */
import type { PersonSlim, TreeResponse, Union } from '../types';

export interface SpouseEdge {
  spouseId: number;
  /** true = bivši brak (razvod/rastava). Smrt supružnika NIJE bivši brak. */
  former: boolean;
}

export interface KinGraph {
  persons: Map<number, PersonSlim>;
  /** parentId → id-jevi dece. */
  childrenOf: Map<number, number[]>;
  /** personId → supružničke ivice iz unions (BEZ obzira na end_date). */
  spousesOf: Map<number, SpouseEdge[]>;
}

/** Da li je union bivši brak (za '(bivši)' u opisu) — razvod/rastava, ili end_date bez smrti. */
function isFormerUnion(u: Union): boolean {
  if (u.end_reason === 'divorce' || u.end_reason === 'separation') return true;
  return u.end_date !== null && u.end_reason !== 'death';
}

export function buildKinGraph(tree: TreeResponse): KinGraph {
  const persons = new Map<number, PersonSlim>();
  for (const p of tree.persons) persons.set(p.id, p);

  const childrenOf = new Map<number, number[]>();
  for (const p of tree.persons) {
    for (const parentId of [p.father_id, p.mother_id]) {
      if (parentId === null || !persons.has(parentId)) continue;
      const list = childrenOf.get(parentId);
      if (list) list.push(p.id);
      else childrenOf.set(parentId, [p.id]);
    }
  }

  // više unions između istog para (razvod pa ponovni brak) → jedna ivica;
  // former samo ako su SVI brakovi para bivši
  const merged = new Map<number, Map<number, boolean>>();
  const addEdge = (from: number, to: number, former: boolean) => {
    let m = merged.get(from);
    if (!m) {
      m = new Map();
      merged.set(from, m);
    }
    const existing = m.get(to);
    m.set(to, existing === undefined ? former : existing && former);
  };
  for (const u of tree.unions) {
    if (!persons.has(u.partner1_id) || !persons.has(u.partner2_id)) continue;
    const former = isFormerUnion(u);
    addEdge(u.partner1_id, u.partner2_id, former);
    addEdge(u.partner2_id, u.partner1_id, former);
  }
  const spousesOf = new Map<number, SpouseEdge[]>();
  for (const [from, m] of merged) {
    spousesOf.set(
      from,
      [...m.entries()].map(([spouseId, former]) => ({ spouseId, former })),
    );
  }

  return { persons, childrenOf, spousesOf };
}

/** Roditelji osobe koji postoje u grafu — otac pa majka (redosled bitan za determinizam BFS-a). */
export function getParents(graph: KinGraph, id: number): number[] {
  const p = graph.persons.get(id);
  if (!p) return [];
  const out: number[] = [];
  if (p.father_id !== null && graph.persons.has(p.father_id)) out.push(p.father_id);
  if (p.mother_id !== null && graph.persons.has(p.mother_id)) out.push(p.mother_id);
  return out;
}
