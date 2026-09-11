/** Prepoznavanje osoba koje verovatno već postoje u stablu — čista logika bez I/O. */
import { foldForSearch } from './search';
import type { Gender } from './types';

export function personName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim() || '?';
}

const YEAR_RE = /^(\d{4})/;

export function birthYear(date: string | null | undefined): number | null {
  const m = date ? YEAR_RE.exec(date) : null;
  return m ? Number(m[1]) : null;
}

/** 'Petar Petrović (1956)' — ili samo ime kad godina nije poznata. */
export function nameWithYear(p: { first_name: string; last_name: string; birth_date: string | null }): string {
  const year = birthYear(p.birth_date);
  return year === null ? personName(p) : `${personName(p)} (${year})`;
}

export interface DuplicateCandidate {
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  gender: Gender;
  birth_date: string | null;
}

const fold = (s: string | null | undefined): string => foldForSearch((s ?? '').trim());

/**
 * Osobe koje verovatno predstavljaju istu osobu kao kandidat: isto ime (bez obzira na
 * dijakritike i pismo), isto prezime ili devojačko prezime, pol se ne kosi i godina
 * rođenja se razlikuje najviše 2 (ako je poznata kod obe).
 */
export function findPossibleDuplicates<T extends DuplicateCandidate>(
  persons: Iterable<T>,
  candidate: DuplicateCandidate,
  limit = 5,
): T[] {
  const first = fold(candidate.first_name);
  if (first === '') return [];
  const candidateSurnames = new Set([fold(candidate.last_name), fold(candidate.maiden_name)].filter(Boolean));
  const candidateYear = birthYear(candidate.birth_date);

  const out: T[] = [];
  for (const p of persons) {
    if (fold(p.first_name) !== first) continue;
    if (candidate.gender !== 'U' && p.gender !== 'U' && candidate.gender !== p.gender) continue;
    const surnames = [fold(p.last_name), fold(p.maiden_name)].filter(Boolean);
    // Bez prezimena na obe strane je poklapanje; samo na jednoj — nije (inače bi svaki „Marko" bio duplikat).
    const surnameMatch =
      candidateSurnames.size === 0 || surnames.length === 0
        ? candidateSurnames.size === 0 && surnames.length === 0
        : surnames.some((s) => candidateSurnames.has(s));
    if (!surnameMatch) continue;
    const year = birthYear(p.birth_date);
    if (candidateYear !== null && year !== null && Math.abs(candidateYear - year) > 2) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}
