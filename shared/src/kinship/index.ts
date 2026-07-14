/**
 * Kalkulator srodstva sa srpskim terminima.
 *
 * Algoritam: BFS od obe osobe naviše do najbližeg zajedničkog pretka (LCA)
 * preko father_id/mother_id, uz najviše JEDNU supružničku ivicu na svakom
 * kraju putanje (za tazbinu: snaha, zet, svekar, tast, dever, šurak, očuh,
 * maćeha, pastorak, pašenog, jetrva, svojak, šurnjaja…). Termin se bira iz
 * tabele pravila po (koraci-gore, koraci-dole, pol osobe B, linija —
 * očinska/majčinska, supružničke ivice); rečenica i kompozicioni fallback
 * opisi se grade ovde. Prijateljstvo (prija/prijatelj) ima supružničku ivicu
 * u SREDINI putanje pa se hvata posebnim detektorom (`detectPrija`).
 */
import type { Gender, PersonSlim, TreeResponse } from '../types';
import { buildKinGraph, type KinGraph } from './graph';
import { findKinPath, findBloodLines, type KinPath } from './resolve';
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
  /**
   * Oznaka zajedničkog pretka linije ('Marisav Mićić i Stanka Mićić') — postavljena
   * samo kad describeKinships vrati VIŠE linija, radi njihovog razlikovanja u UI-ju.
   */
  viaLabel?: string;
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

interface PrijaMatch {
  /** Putanja A → A-ino dete → supružnik deteta → B. */
  path: number[];
  /** Pol osobe B (određuje termin: prijatelj/prija). */
  bGender: Gender;
  /** Pol osobe koja se udala/oženila u porodicu (snaha = F, zet = M). */
  inLawGender: Gender;
  /** Brak dece je bivši. */
  former: boolean;
}

/**
 * Prijateljstvo (prija/prijatelj): roditelji venčane dece. Supružnička ivica je
 * u SREDINI putanje (dole do deteta → brak → gore do svata), pa je BFS u
 * findKinPath ne hvata; tražimo je posebno kad nema bližeg srodstva.
 */
function detectPrija(graph: KinGraph, aId: number, bId: number): PrijaMatch | null {
  const b = graph.persons.get(bId);
  if (b === undefined) return null;
  for (const childId of graph.childrenOf.get(aId) ?? []) {
    for (const edge of graph.spousesOf.get(childId) ?? []) {
      const inLaw = graph.persons.get(edge.spouseId);
      if (inLaw === undefined) continue;
      if (inLaw.father_id === bId || inLaw.mother_id === bId) {
        return { path: [aId, childId, edge.spouseId, bId], bGender: b.gender, inLawGender: inLaw.gender, former: edge.former };
      }
    }
  }
  return null;
}

/** Formatira jednu pronađenu putanju (kp) u KinshipResult (termin ili kompozicioni opis). */
function buildResult(graph: KinGraph, kp: KinPath, a: PersonSlim, b: PersonSlim): KinshipResult {
  const aName = a.first_name || `#${a.id}`;
  const bName = b.first_name || `#${b.id}`;

  const hasSpouseEdge = kp.spouseAtA !== null || kp.spouseAtB !== null;
  const degree = hasSpouseEdge ? null : kp.stepsUp + kp.stepsDown;
  // Prevoj (zajednički predak) je na kraju uzlaznog dela: opciona supružnička ivica
  // na A strani gura sve za jedno mesto udesno.
  const apexIndex = (kp.spouseAtA !== null ? 1 : 0) + kp.stepsUp;
  const former = (kp.spouseAtA?.former ?? false) || (kp.spouseAtB?.former ?? false);
  const formerSuffix = former ? ' (bivši)' : '';

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

/** Najbliža veza A→B nad već izgrađenim grafom (uklj. tazbinu i prija). */
function describeWithGraph(graph: KinGraph, fromId: number, toId: number): KinshipResult {
  const a = graph.persons.get(fromId);
  const b = graph.persons.get(toId);
  if (a === undefined || b === undefined) return UNRELATED;
  if (fromId === toId) {
    return { related: true, term: null, description: 'Ista osoba.', path: [fromId], degree: 0, apexIndex: 0 };
  }

  const aName = a.first_name || `#${a.id}`;
  const bName = b.first_name || `#${b.id}`;

  const kp = findKinPath(graph, fromId, toId);
  if (kp === null) {
    const prija = detectPrija(graph, fromId, toId);
    if (prija !== null) {
      const role = prija.inLawGender === 'F' ? 'snahe' : prija.inLawGender === 'M' ? 'zeta' : 'deteta';
      const formerSuffix = prija.former ? ' (bivši)' : '';
      const base = { related: true as const, path: prija.path, degree: null, apexIndex: null };
      if (prija.bGender === 'M') {
        return { ...base, term: 'prijatelj', description: `${bName} je ${possessive(aName, 'm')} prijatelj (roditelj ${role})${formerSuffix}.` };
      }
      if (prija.bGender === 'F') {
        return { ...base, term: 'prija', description: `${bName} je ${possessive(aName, 'f')} prija (roditelj ${role})${formerSuffix}.` };
      }
      return { ...base, term: null, description: `${bName} i ${aName} su prijatelji (roditelji venčane dece)${formerSuffix}.` };
    }
    return UNRELATED;
  }

  return buildResult(graph, kp, a, b);
}

/** Glavni API — čist, bez I/O; radi nad TreeResponse kešom na klijentu, testira se na serveru. */
export function describeKinship(tree: TreeResponse, fromId: number, toId: number): KinshipResult {
  return describeWithGraph(buildKinGraph(tree), fromId, toId);
}

/** Nazivi zajedničkih predaka linije, npr. 'Marisav Mićić i Stanka Mićić' (za viaLabel). */
function apexNames(graph: KinGraph, apexIds: number[]): string {
  return apexIds
    .map((id) => {
      const p = graph.persons.get(id);
      return p ? `${p.first_name} ${p.last_name}`.trim() || `#${id}` : `#${id}`;
    })
    .join(' i ');
}

/**
 * Sve NEZAVISNE veze A→B, najbliža prva, najviše `limit` (podrazumevano 3). Prva linija
 * je uvek jednaka describeKinship (uklj. tazbinu); dodatne su dalje nezavisne KRVNE
 * linije — za dvostruko/višestruko srodstvo (npr. isti par u srodstvu i po dedi i po babi).
 * Kad postoji samo jedna veza, vraća niz sa jednim elementom (bez viaLabel-a).
 */
export function describeKinships(tree: TreeResponse, fromId: number, toId: number, limit = 3): KinshipResult[] {
  const graph = buildKinGraph(tree);
  const primary = describeWithGraph(graph, fromId, toId);
  if (!primary.related || fromId === toId) return [primary];

  const a = graph.persons.get(fromId);
  const b = graph.persons.get(toId);
  if (a === undefined || b === undefined) return [primary];

  const bloodLines = findBloodLines(graph, fromId, toId, limit + 1);
  if (bloodLines.length <= 1) return [primary];

  // Apex primarne veze (samo ako je krvna) — da tu liniju ne dupliramo.
  const primaryApex =
    primary.degree !== null && primary.apexIndex !== null ? (primary.path[primary.apexIndex] ?? null) : null;
  const primaryGroup = primaryApex !== null ? bloodLines.find((l) => l.apexIds.includes(primaryApex)) : undefined;

  const out: { result: KinshipResult; apexIds: number[] }[] = [
    { result: primary, apexIds: primaryGroup?.apexIds ?? [] },
  ];
  for (const line of bloodLines) {
    if (out.length >= limit) break;
    if (primaryApex !== null && line.apexIds.includes(primaryApex)) continue; // već je primarna
    out.push({ result: buildResult(graph, line.kp, a, b), apexIds: line.apexIds });
  }

  if (out.length === 1) return [primary];
  return out.map(({ result, apexIds }) =>
    apexIds.length > 0 ? { ...result, viaLabel: apexNames(graph, apexIds) } : result,
  );
}
