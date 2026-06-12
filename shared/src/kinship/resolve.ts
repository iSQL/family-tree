/**
 * Pronalaženje srodničke putanje: BFS naviše od obe osobe do najbližeg
 * zajedničkog pretka (LCA) preko father_id/mother_id, uz najviše JEDNU
 * supružničku ivicu na svakom kraju putanje (tazbina: svekar, zet, dever…).
 * Najkraća ukupna putanja pobeđuje; tie-break deterministički: krvna pre
 * tazbinske, otac pre majke (redosled iz getParents), pa redosled unosa.
 */
import type { KinGraph, SpouseEdge } from './graph';
import { getParents } from './graph';

export type ParentLine = 'father' | 'mother';

export interface SpouseLink {
  /** true = bivši brak (razvod/rastava). */
  former: boolean;
}

export interface KinPath {
  /** Rodni koraci naviše od ankera A-strane do zajedničkog pretka. */
  stepsUp: number;
  /** Rodni koraci naniže od zajedničkog pretka do ankera B-strane. */
  stepsDown: number;
  /** Kroz kog roditelja ide prvi korak naviše (null kad je stepsUp 0). */
  firstUpLine: ParentLine | null;
  /** Supružnička ivica na A strani (A → anker), ili null. */
  spouseAtA: SpouseLink | null;
  /** Supružnička ivica na B strani (anker → B), ili null. */
  spouseAtB: SpouseLink | null;
  /** Svi id-jevi duž putanje od A do B, uključujući obe osobe. */
  path: number[];
}

interface AncEntry {
  depth: number;
  /** Čvor iz kog je predak dosegnut (njegovo dete na putanji); null za polaznu osobu. */
  child: number | null;
}

/** BFS naviše: svi preci (uklj. polaznu osobu) sa dubinom i pokazivačem ka detetu. */
function ancestorMap(graph: KinGraph, startId: number): Map<number, AncEntry> {
  const map = new Map<number, AncEntry>([[startId, { depth: 0, child: null }]]);
  const queue = [startId];
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i]!;
    const depth = map.get(id)!.depth;
    for (const parentId of getParents(graph, id)) {
      if (map.has(parentId)) continue;
      map.set(parentId, { depth: depth + 1, child: id });
      queue.push(parentId);
    }
  }
  return map;
}

interface BloodPath {
  up: number;
  down: number;
  /** [x .. lca .. y] */
  nodes: number[];
}

/** Najkraća krvna putanja x → LCA → y; null ako nema zajedničkog pretka. */
function bloodPath(graph: KinGraph, x: number, y: number): BloodPath | null {
  const ax = ancestorMap(graph, x);
  const ay = ancestorMap(graph, y);
  let lca: number | null = null;
  let up = 0;
  let down = 0;
  // BFS redosled iteracije: rastuća dubina, otac pre majke → determinizam
  for (const [anc, ex] of ax) {
    const ey = ay.get(anc);
    if (ey === undefined) continue;
    if (lca === null || ex.depth + ey.depth < up + down) {
      lca = anc;
      up = ex.depth;
      down = ey.depth;
    }
  }
  if (lca === null) return null;
  const nodes: number[] = [];
  let cur: number | null = lca;
  while (cur !== null) {
    nodes.push(cur);
    cur = ax.get(cur)!.child;
  }
  nodes.reverse(); // [x .. lca]
  let curDown: number | null = ay.get(lca)!.child;
  while (curDown !== null) {
    nodes.push(curDown);
    curDown = ay.get(curDown)!.child;
  }
  return { up, down, nodes };
}

interface Anchor {
  id: number;
  edge: SpouseEdge | null;
}

/** Ankeri jedne strane: sama osoba (bez ivice) + svi njeni supružnici. */
function anchorsFor(graph: KinGraph, id: number): Anchor[] {
  const out: Anchor[] = [{ id, edge: null }];
  for (const e of graph.spousesOf.get(id) ?? []) out.push({ id: e.spouseId, edge: e });
  return out;
}

/**
 * Najkraća putanja od A (fromId) do B (toId): krvna (gore-dole preko LCA)
 * sa opcionom supružničkom ivicom na svakom kraju. null ako veze nema.
 */
export function findKinPath(graph: KinGraph, fromId: number, toId: number): KinPath | null {
  if (!graph.persons.has(fromId) || !graph.persons.has(toId)) return null;
  if (fromId === toId) {
    return { stepsUp: 0, stepsDown: 0, firstUpLine: null, spouseAtA: null, spouseAtB: null, path: [fromId] };
  }

  let best: KinPath | null = null;
  let bestCost = 0;
  let bestSpouses = 0;

  for (const aa of anchorsFor(graph, fromId)) {
    for (const bb of anchorsFor(graph, toId)) {
      const blood = bloodPath(graph, aa.id, bb.id);
      if (blood === null) continue;
      const spouses = (aa.edge ? 1 : 0) + (bb.edge ? 1 : 0);
      const cost = blood.up + blood.down + spouses;
      // tie-break: jednaka cena → manje supružničkih ivica; inače prvi nađeni
      if (best !== null && (cost > bestCost || (cost === bestCost && spouses >= bestSpouses))) continue;
      const nodes = [...(aa.edge ? [fromId] : []), ...blood.nodes, ...(bb.edge ? [toId] : [])];
      if (new Set(nodes).size !== nodes.length) continue; // degenerisana putanja (ista osoba dvaput)
      let firstUpLine: ParentLine | null = null;
      if (blood.up > 0) {
        const anchorPerson = graph.persons.get(aa.id)!;
        firstUpLine = blood.nodes[1] === anchorPerson.father_id ? 'father' : 'mother';
      }
      best = {
        stepsUp: blood.up,
        stepsDown: blood.down,
        firstUpLine,
        spouseAtA: aa.edge ? { former: aa.edge.former } : null,
        spouseAtB: bb.edge ? { former: bb.edge.former } : null,
        path: nodes,
      };
      bestCost = cost;
      bestSpouses = spouses;
    }
  }
  return best;
}
