/**
 * Izbor dubine prikaza stabla (broj generacija oko glavne osobe) — čista logika,
 * testirana na node-u. Koristi je klijent (Tree.tsx) da odredi koliko generacija
 * nagore/nadole renderovati: family-chart `setAncestryDepth`/`setProgenyDepth`
 * fizički potkresuju hijerarhiju, pa ovo direktno ograničava broj iscrtanih čvorova.
 *
 * Konvencija: `undefined` = neograničeno (f3 sentinela), `0` = samo glavna osoba.
 */

/** Iznad ovoliko osoba stablo se podrazumevano otvara ograničeno (perf). */
export const LARGE_TREE_THRESHOLD = 150;
/** Podrazumevana dubina za velika stabla kad korisnik nije zadao svoju. */
export const DEFAULT_ANCESTRY_DEPTH = 2;
export const DEFAULT_PROGENY_DEPTH = 3;

export interface TreeDepth {
  /** Generacije nagore (preci). undefined = neograničeno. */
  ancestry?: number;
  /** Generacije nadole (potomci). undefined = neograničeno. */
  progeny?: number;
}

/** Validna eksplicitna dubina je ceo broj ≥ 0; sve ostalo → undefined. */
function normalizeDepth(value: number | null | undefined): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (!Number.isFinite(value) || !Number.isInteger(value) || value < 0) return undefined;
  return value;
}

/**
 * Odredi efektivnu dubinu prikaza:
 *  - eksplicitna vrednost (iz URL-a) uvek pobeđuje, po osi;
 *  - bez eksplicitne: malo stablo → neograničeno (kao i do sad), veliko → podrazumevano.
 * Ose su nezavisne: zadat samo `up` ostavlja `down` na adaptivnom podrazumevanom.
 */
export function resolveTreeDepth(
  personCount: number,
  upParam: number | null | undefined,
  downParam: number | null | undefined,
): TreeDepth {
  const up = normalizeDepth(upParam);
  const down = normalizeDepth(downParam);
  const small = personCount <= LARGE_TREE_THRESHOLD;

  return {
    ancestry: up ?? (small ? undefined : DEFAULT_ANCESTRY_DEPTH),
    progeny: down ?? (small ? undefined : DEFAULT_PROGENY_DEPTH),
  };
}
