/**
 * Raspored postera za štampu — koristi ISTI layout motor kao interaktivno stablo
 * (family-chart CalculateTree), pa poster izgleda kao prikaz na ekranu. Pored
 * TreeCanvas-a i toF3.ts, ovo je jedini modul koji sme da uvozi 'family-chart';
 * napolje izlaze samo goli koordinatni podaci (bez f3 tipova).
 */
import f3 from 'family-chart';
import type { PersonSlim, TreeResponse } from '@shared/types';
import { toF3 } from './toF3';

/** Dimenzije kartice u logičkim px — poster se kasnije skalira na papir. */
export const CARD_W = 190;
export const CARD_H = 66;
const NODE_SEP = 230;
const LEVEL_SEP = 170;
/** Margina oko sadržaja — prostor za okvir isticanja i zaokruživanje zoom skale. */
const MARGIN = 10;

export interface PosterNode {
  person: PersonSlim;
  /** Gornji levi ugao kartice u koordinatama postera (0,0 = gore levo). */
  x: number;
  y: number;
}

export interface PosterLine {
  /** SVG polyline `points` atribut. */
  points: string;
  /** true = spojnica ka glavnoj osobi (istaknuta boja). */
  main: boolean;
}

export interface PosterLayout {
  nodes: PosterNode[];
  lines: PosterLine[];
  width: number;
  height: number;
}

interface F3Node {
  data: { id: string };
  x: number;
  y: number;
}

const EMPTY: PosterLayout = { nodes: [], lines: [], width: CARD_W, height: CARD_H };

export interface PosterLayoutOptions {
  /** Broj generacija potomaka od glavne osobe; undefined = sve (kao u interaktivnom stablu). */
  progenyDepth?: number | undefined;
}

/**
 * Izračunaj raspored kartica i spojnica za poster. `mainId` je glavna osoba
 * (koren prikaza); stablo treba unapred svesti na željeni obim (posterSubtree).
 */
export function calcPosterLayout(
  tree: TreeResponse,
  mainId: number,
  opts: PosterLayoutOptions = {},
): PosterLayout {
  const persons = new Map(tree.persons.map((p) => [p.id, p]));
  if (!persons.has(mainId)) return EMPTY;

  const data = toF3(tree);
  const calc = f3.CalculateTree({
    data: data as unknown as Parameters<typeof f3.CalculateTree>[0]['data'],
    main_id: String(mainId),
    node_separation: NODE_SEP,
    level_separation: LEVEL_SEP,
    single_parent_empty_card: false,
    show_siblings_of_main: true,
    progeny_depth: opts.progenyDepth,
  });

  // Centar kartice po osobi (f3 x/y su centri kartica).
  const rawCenter = new Map<number, { x: number; y: number }>();
  for (const n of calc.data as unknown as F3Node[]) {
    const id = Number(n.data.id);
    if (persons.has(id) && !rawCenter.has(id)) rawCenter.set(id, { x: n.x, y: n.y });
  }
  if (rawCenter.size === 0) return EMPTY;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const c of rawCenter.values()) {
    minX = Math.min(minX, c.x);
    minY = Math.min(minY, c.y);
    maxX = Math.max(maxX, c.x);
    maxY = Math.max(maxY, c.y);
  }

  // Normalizovani CENTAR kartice; MARGIN oko sadržaja da okvir isticanja (outline +
  // senka, ~5px van kartice) i zaokruživanje zoom skale ne budu isečeni na ivicama.
  const at = (id: number) => {
    const c = rawCenter.get(id);
    return c ? { x: c.x - minX + CARD_W / 2 + MARGIN, y: c.y - minY + CARD_H / 2 + MARGIN } : null;
  };

  const nodes: PosterNode[] = [];
  for (const id of rawCenter.keys()) {
    const c = at(id)!;
    nodes.push({ person: persons.get(id)!, x: c.x - CARD_W / 2, y: c.y - CARD_H / 2 });
  }
  nodes.sort((a, b) => a.person.id - b.person.id);

  const lines: PosterLine[] = [];

  // Supružničke linije — horizontala između centara partnera (kartice je prekriju).
  const coupleDrawn = new Set<string>();
  const coupleLine = (aId: number, bId: number) => {
    const key = aId < bId ? `${aId}-${bId}` : `${bId}-${aId}`;
    if (coupleDrawn.has(key)) return;
    coupleDrawn.add(key);
    const a = at(aId);
    const b = at(bId);
    if (!a || !b || a.y !== b.y) return;
    lines.push({ points: `${a.x},${a.y} ${b.x},${b.y}`, main: false });
  };
  for (const u of tree.unions) coupleLine(u.partner1_id, u.partner2_id);
  // Ko-roditelji bez union-a — ista linija, da spojnica deteta ima uporište.
  for (const p of tree.persons) {
    if (p.father_id !== null && p.mother_id !== null) coupleLine(p.father_id, p.mother_id);
  }

  // Roditelj→dete: od sredine para (ili roditelja) naniže, vodoravno, pa do vrha kartice deteta.
  for (const p of tree.persons) {
    const child = at(p.id);
    if (!child) continue;
    const f = p.father_id !== null ? at(p.father_id) : null;
    const m = p.mother_id !== null ? at(p.mother_id) : null;
    if (!f && !m) continue;
    const anchorX = f && m ? (f.x + m.x) / 2 : (f ?? m)!.x;
    const anchorY = (f ?? m)!.y;
    if (child.y <= anchorY) continue; // zaštita od degenerisanog rasporeda
    const busY = child.y - CARD_H / 2 - 28;
    lines.push({
      points: `${anchorX},${anchorY} ${anchorX},${busY} ${child.x},${busY} ${child.x},${child.y - CARD_H / 2}`,
      main: p.id === mainId,
    });
  }

  return {
    nodes,
    lines,
    width: maxX - minX + CARD_W + 2 * MARGIN,
    height: maxY - minY + CARD_H + 2 * MARGIN,
  };
}
