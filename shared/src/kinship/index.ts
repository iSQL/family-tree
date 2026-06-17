/**
 * Kalkulator srodstva sa srpskim terminima.
 *
 * Algoritam: BFS od obe osobe naviše do najbližeg zajedničkog pretka (LCA)
 * preko father_id/mother_id, uz najviše JEDNU supružničku ivicu na svakom
 * kraju putanje (za tazbinu: snaha, zet, svekar, tast, dever, šurak…).
 * Termin se bira iz tabele pravila po (koraci-gore, koraci-dole, pol osobe B,
 * linija — očinska/majčinska, supružničke ivice); rečenica i kompozicioni
 * fallback opisi se grade ovde.
 */
import type { PersonSlim, TreeResponse } from '../types';
import { buildKinGraph, type KinGraph } from './graph';
import { findKinPath } from './resolve';
import { resolveTerm, type TermGender } from './terms';

export interface KinshipResult {
  related: boolean;
  /**
   * Srpski termin: šta je osoba B (toId) osobi A (fromId).
   * Npr. 'stric' znači „B je stric osobi A".
   * null ako nisu u srodstvu ili termin nije u tabeli (fallback ide u description).
   */
  term: string | null;
  /** Čitljiva rečenica, npr. 'Petar je Markov stric (očev brat).' Uvek popunjena. */
  description: string;
  /** ID-jevi osoba duž pronađene putanje od A do B, uključujući obe (prazan niz ako nisu u srodstvu). */
  path: number[];
  /** Koleno srodstva (broj rodnih koraka na putanji); null za supružničke/tazbinske veze ili bez srodstva. */
  degree: number | null;
  /**
   * Indeks „prevojne" osobe u `path` — najbližeg zajedničkog pretka. Do nje se ide
   * naviše (A → predak), od nje naniže (predak → B). null kad nema putanje. Za čisto
   * uzlazne/silazne veze poklapa se sa krajem/početkom (B odn. A je sam predak).
   */
  apexIndex: number | null;
}

/** Česta imena sa nepostojanim a ('Petar' → 'Petrov'). */
const FLEETING_A = new Set(['petar', 'aleksandar']);

const PALATAL_END = /[šžčćđjcŠŽČĆĐJC]$/;

/**
 * Prisvojni pridev od imena (heuristika za srpska imena):
 * Marko→Markov, Ana→Anin, Milica→Miličin, Miloš→Milošev, Đorđe→Đorđev, Petar→Petrov.
 * Rod prati termin: 'Markov stric', 'Markova tetka', 'Markovo dete'.
 */
function possessive(name: string, gender: TermGender): string {
  const genderSuffix = gender === 'f' ? 'a' : gender === 'n' ? 'o' : '';
  let stem = name;
  let base: string;
  if (FLEETING_A.has(name.toLowerCase())) {
    stem = name.slice(0, -2) + name.slice(-1); // Petar → Petr
    base = 'ov';
  } else if (/[aA]$/.test(name)) {
    stem = name.slice(0, -1);
    // palatalizacija c → č: Milica → Miličin, Ljubica → Ljubičin
    if (stem.endsWith('c')) stem = stem.slice(0, -1) + 'č';
    else if (stem.endsWith('C')) stem = stem.slice(0, -1) + 'Č';
    base = 'in';
  } else if (/[oOeE]$/.test(name)) {
    stem = name.slice(0, -1);
    base = PALATAL_END.test(stem) ? 'ev' : 'ov'; // Marko→Markov, Đorđe→Đorđev
  } else {
    base = PALATAL_END.test(name) ? 'ev' : 'ov'; // Jovan→Jovanov, Miloš→Milošev
  }
  return stem + base + genderSuffix;
}

/** Genitiv reči koraka za kompozicioni lanac ('sin brata oca'). */
const GENITIVE: Record<string, string> = {
  otac: 'oca',
  majka: 'majke',
  roditelj: 'roditelja',
  sin: 'sina',
  ćerka: 'ćerke',
  dete: 'deteta',
  muž: 'muža',
  žena: 'žene',
  supružnik: 'supružnika',
};

/** Reč jednog koraka putanje: šta je `to` osobi `from`. */
function stepWord(from: PersonSlim, to: PersonSlim): string {
  if (to.id === from.father_id || to.id === from.mother_id) {
    return to.gender === 'M' ? 'otac' : to.gender === 'F' ? 'majka' : 'roditelj';
  }
  if (from.id === to.father_id || from.id === to.mother_id) {
    return to.gender === 'M' ? 'sin' : to.gender === 'F' ? 'ćerka' : 'dete';
  }
  return to.gender === 'M' ? 'muž' : to.gender === 'F' ? 'žena' : 'supružnik';
}

/** Kompozicioni opis putanje od B ka A, npr. 'sin brata oca' (prva reč nominativ, ostale genitiv). */
function composeChain(graph: KinGraph, pathIds: number[]): string {
  const words: string[] = [];
  for (let i = pathIds.length - 1; i >= 1; i--) {
    const to = graph.persons.get(pathIds[i]!)!;
    const from = graph.persons.get(pathIds[i - 1]!)!;
    words.push(stepWord(from, to));
  }
  return words.map((w, i) => (i === 0 ? w : (GENITIVE[w] ?? w))).join(' ');
}

const UNRELATED: KinshipResult = {
  related: false,
  term: null,
  description: 'Nisu u krvnom srodstvu.',
  path: [],
  degree: null,
  apexIndex: null,
};

/** Glavni API — čist, bez I/O; radi nad TreeResponse kešom na klijentu, testira se na serveru. */
export function describeKinship(tree: TreeResponse, fromId: number, toId: number): KinshipResult {
  const graph = buildKinGraph(tree);
  const a = graph.persons.get(fromId);
  const b = graph.persons.get(toId);
  if (a === undefined || b === undefined) return UNRELATED;
  if (fromId === toId) {
    return { related: true, term: null, description: 'Ista osoba.', path: [fromId], degree: 0, apexIndex: 0 };
  }

  const kp = findKinPath(graph, fromId, toId);
  if (kp === null) return UNRELATED;

  const hasSpouseEdge = kp.spouseAtA !== null || kp.spouseAtB !== null;
  const degree = hasSpouseEdge ? null : kp.stepsUp + kp.stepsDown;
  // Prevoj (zajednički predak) je na kraju uzlaznog dela: opciona supružnička ivica
  // na A strani gura sve za jedno mesto udesno.
  const apexIndex = (kp.spouseAtA !== null ? 1 : 0) + kp.stepsUp;
  const former = (kp.spouseAtA?.former ?? false) || (kp.spouseAtB?.former ?? false);
  const formerSuffix = former ? ' (bivši)' : '';

  const aName = a.first_name || `#${a.id}`;
  const bName = b.first_name || `#${b.id}`;
  const resolved = resolveTerm(graph, kp, a, b);

  if (resolved.term !== null) {
    const detailPart = resolved.detail !== null ? ` ${resolved.detail}` : '';
    return {
      related: true,
      term: resolved.term,
      description: `${bName} je ${possessive(aName, resolved.gender)} ${resolved.term}${detailPart}${formerSuffix}.`,
      path: kp.path,
      degree,
      apexIndex,
    };
  }

  // nepokrivena putanja → kompozicioni opis (+ koleno za čisto krvne putanje)
  const chain = composeChain(graph, kp.path);
  const cousinWord = b.gender === 'M' ? 'rođak' : b.gender === 'F' ? 'rođaka' : 'rođak/rođaka';
  const degreePart = degree !== null ? ` (${cousinWord} u ${degree}. kolenu)` : '';
  return {
    related: true,
    term: null,
    description: `${bName} je ${chain} osobe ${aName}${formerSuffix}${degreePart}.`,
    path: kp.path,
    degree,
    apexIndex,
  };
}
