/**
 * Rad sa parcijalnim ISO datumima: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'.
 * (Leksikografski sort validnih vrednosti = hronološki.)
 */

export interface PartialDate {
  year: number;
  month?: number;
  day?: number;
}

const PARTIAL_RE = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/;

export const MONTHS_SR = [
  'januar', 'februar', 'mart', 'april', 'maj', 'jun',
  'jul', 'avgust', 'septembar', 'oktobar', 'novembar', 'decembar',
] as const;

/** Levo dopunjava broj nulama do dve cifre ('3' → '03'). */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/** Broj dana u mesecu (1-12) date godine — bez Date objekata (godine <100 ih zbunjuju). */
function daysInMonth(year: number, month: number): number {
  const dim = [31, isLeapYear(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  return dim[month - 1]!;
}

/** Parsira parcijalni ISO datum; null za null/undefined/nevalidan ulaz. */
export function parsePartialDate(value: string | null | undefined): PartialDate | null {
  if (value == null) return null;
  const m = PARTIAL_RE.exec(value);
  if (!m) return null;
  const year = Number(m[1]);
  const result: PartialDate = { year };
  if (m[2] !== undefined) {
    const month = Number(m[2]);
    if (month < 1 || month > 12) return null;
    result.month = month;
    if (m[3] !== undefined) {
      const day = Number(m[3]);
      if (day < 1 || day > daysInMonth(year, month)) return null;
      result.day = day;
    }
  }
  return result;
}

/**
 * Komparator za rastući hronološki sort. null/nevalidne vrednosti idu POSLEDNJE.
 * Nepoznati delovi se za poređenje tretiraju kao najraniji ('1956' ≈ '1956-01-01');
 * pri izjednačenju kraći (manje precizan) ide prvi.
 */
export function comparePartialDates(a: string | null | undefined, b: string | null | undefined): number {
  const pa = parsePartialDate(a);
  const pb = parsePartialDate(b);
  if (pa === null && pb === null) return 0;
  if (pa === null) return 1;
  if (pb === null) return -1;
  if (pa.year !== pb.year) return pa.year - pb.year;
  const ma = pa.month ?? 1;
  const mb = pb.month ?? 1;
  if (ma !== mb) return ma - mb;
  const da = pa.day ?? 1;
  const db = pb.day ?? 1;
  if (da !== db) return da - db;
  // izjednačeni — manje precizan (kraći) ide prvi
  const precA = pa.day !== undefined ? 3 : pa.month !== undefined ? 2 : 1;
  const precB = pb.day !== undefined ? 3 : pb.month !== undefined ? 2 : 1;
  return precA - precB;
}

/**
 * Prikaz za sr-Latn:
 *  '1956-03-15' → '15.03.1956.'  |  '1956-03' → 'mart 1956.'  |  '1956' → '1956.'
 * Prazan string za null/nevalidan ulaz.
 */
export function formatPartialDate(value: string | null | undefined): string {
  const p = parsePartialDate(value);
  if (p === null) return '';
  if (p.day !== undefined && p.month !== undefined) {
    return `${pad2(p.day)}.${pad2(p.month)}.${p.year}.`;
  }
  if (p.month !== undefined) {
    return `${MONTHS_SR[p.month - 1]} ${p.year}.`;
  }
  return `${p.year}.`;
}

const INPUT_DMY_RE = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/;
const INPUT_MY_RE = /^(\d{1,2})\.(\d{4})$/;
const INPUT_Y_RE = /^(\d{4})$/;

/**
 * Parsira korisnički unos u evropskom formatu u parcijalni ISO datum:
 *  'DD.MM.GGGG' → 'GGGG-MM-DD'  |  'MM.GGGG' → 'GGGG-MM'  |  'GGGG' → 'GGGG'
 * Toleriše završnu tačku ('15.03.1956.'). null za prazan ili nevalidan unos.
 */
export function parsePartialDateInput(value: string | null | undefined): string | null {
  if (value == null) return null;
  let s = value.trim();
  if (s === '') return null;
  if (s.endsWith('.')) s = s.slice(0, -1).trim();

  let iso: string | null = null;
  let m: RegExpExecArray | null;
  if ((m = INPUT_DMY_RE.exec(s))) {
    iso = `${m[3]}-${pad2(Number(m[2]))}-${pad2(Number(m[1]))}`;
  } else if ((m = INPUT_MY_RE.exec(s))) {
    iso = `${m[2]}-${pad2(Number(m[1]))}`;
  } else if ((m = INPUT_Y_RE.exec(s))) {
    iso = m[1]!;
  } else {
    return null;
  }
  // Validacija opsega (meseci, dani, prestupne godine) preko parsera.
  return parsePartialDate(iso) ? iso : null;
}

/**
 * Parcijalni ISO datum → uredljiv tekst za polje unosa (bez završne tačke, vodeće nule):
 *  '1956-03-15' → '15.03.1956'  |  '1956-03' → '03.1956'  |  '1956' → '1956'
 * Prazan string za null/nevalidan ulaz.
 */
export function formatPartialDateInput(value: string | null | undefined): string {
  const p = parsePartialDate(value);
  if (p === null) return '';
  const y = String(p.year).padStart(4, '0');
  if (p.day !== undefined && p.month !== undefined) {
    return `${pad2(p.day)}.${pad2(p.month)}.${y}`;
  }
  if (p.month !== undefined) {
    return `${pad2(p.month)}.${y}`;
  }
  return y;
}

/** Normalizuje `at` u lokalne (year, month, day) komponente. */
function toLocalYmd(at: Date | string): { y: number; m: number; d: number } | null {
  if (typeof at === 'string') {
    const p = parsePartialDate(at);
    if (p === null) return null;
    return { y: p.year, m: p.month ?? 1, d: p.day ?? 1 };
  }
  return { y: at.getFullYear(), m: at.getMonth() + 1, d: at.getDate() };
}

/**
 * Starost (pune godine) na dan `at` (default: danas).
 * Nepoznat mesec/dan u datumu rođenja tretira se kao 1. januar / 1. u mesecu.
 * null ako birth nije parsiv.
 */
export function ageAt(birth: string | null | undefined, at?: Date | string): number | null {
  const b = parsePartialDate(birth);
  if (b === null) return null;
  const ref = toLocalYmd(at ?? new Date());
  if (ref === null) return null;
  const bm = b.month ?? 1;
  const bd = b.day ?? 1;
  let age = ref.y - b.year;
  // rođendan još nije prošao u referentnoj godini
  if (ref.m < bm || (ref.m === bm && ref.d < bd)) age -= 1;
  return age;
}

/**
 * Datum sledećeg rođendana posle `from` (default: danas; ako je rođendan danas, vraća danas).
 * Vraća null osim za PUN datum rođenja (YYYY-MM-DD) — parcijalni datumi ne generišu podsetnike.
 * 29. februar → 28. februar u neprestupnim godinama.
 */
export function nextBirthday(birth: string | null | undefined, from?: Date): Date | null {
  const b = parsePartialDate(birth);
  if (b === null || b.month === undefined || b.day === undefined) return null;
  const ref = from ?? new Date();
  const ry = ref.getFullYear();
  const rm = ref.getMonth() + 1;
  const rd = ref.getDate();

  // efektivni (mesec, dan) rođendana u datoj godini — 29.2. → 28.2. u neprestupnoj
  const effective = (year: number): { m: number; d: number } => {
    if (b.month === 2 && b.day === 29 && !isLeapYear(year)) return { m: 2, d: 28 };
    return { m: b.month!, d: b.day! };
  };

  const thisYear = effective(ry);
  // da li je ovogodišnji rođendan danas ili u budućnosti?
  if (thisYear.m > rm || (thisYear.m === rm && thisYear.d >= rd)) {
    return new Date(ry, thisYear.m - 1, thisYear.d);
  }
  const next = effective(ry + 1);
  return new Date(ry + 1, next.m - 1, next.d);
}

/** Broj celih kalendarskih dana od `a` do `b` (ponoć-do-ponoć, lokalno vreme). */
export function daysBetween(a: Date, b: Date): number {
  // UTC ponoći konstruisane iz LOKALNIH komponenti — imune na DST pomeranja
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86_400_000);
}
