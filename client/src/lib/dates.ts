/** Re-export deljene logike datuma + klijentski pomoćnici za prikaz. */
import { formatPartialDate } from '@shared/partialDate';

export * from '@shared/partialDate';

/** ISO vremenska oznaka sa servera → lokalni datum za prikaz ('2026-09-10T08:00:00Z' → '10.09.2026.'). */
export function formatTimestampDate(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const pad = (n: number) => String(n).padStart(2, '0');
  return formatPartialDate(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
}

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
