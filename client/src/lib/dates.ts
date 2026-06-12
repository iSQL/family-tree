/** Re-export deljene logike datuma + klijentski pomoćnici za prikaz. */
export * from '@shared/partialDate';

const YEAR_RE = /^\d{4}/;

function yearOf(value: string | null | undefined): string {
  if (!value) return '';
  const m = YEAR_RE.exec(value);
  return m ? m[0] : '';
}

/**
 * '1956-03-15' + '2020' → '1956–2020'; samo rođenje → '1956'; samo smrt → '–2020'.
 * Prazan string ako nema nijednog datuma.
 */
export function formatLifespan(
  birth: string | null | undefined,
  death: string | null | undefined,
): string {
  const b = yearOf(birth);
  const d = yearOf(death);
  if (b && d) return `${b}–${d}`;
  if (b) return b;
  if (d) return `–${d}`;
  return '';
}
