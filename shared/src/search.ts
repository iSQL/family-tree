/**
 * Klijentska pretraga imena sa foldingom pisma i dijakritike.
 */

/** Kompletna mapa srpske ćirilice → osnovna latinica (digrafi: љ→lj, њ→nj, џ→dz). */
const CYRILLIC_MAP: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'dj', е: 'e', ж: 'z',
  з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n',
  њ: 'nj', о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u',
  ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

/** Latinična slova koja NFD ne razlaže ili razlaže pogrešno. */
const LATIN_MAP: Record<string, string> = {
  đ: 'dj',
  ǆ: 'dz', ǳ: 'dz', // unicode digrafi dž
  ǉ: 'lj', ǌ: 'nj',
};

/** Kombinujući dijakritički znaci (U+0300–U+036F) posle NFD dekompozicije. */
const COMBINING_MARKS = new RegExp('[\\u0300-\\u036f]', 'g');

/**
 * Normalizuje string za pretragu:
 *  - lowercase
 *  - srpska ćirilica → latinica (uklj. digrafe: љ→lj, њ→nj, џ→dz)
 *  - đ→dj, dž→dz, š→s, č→c, ć→c, ž→z (i velika slova)
 *  - ostala dijakritika skinuta (NFD strip)
 *  - višestruki razmaci sažeti, trim
 * Primer: foldForSearch('Ђорђевић') === foldForSearch('Đorđević') === 'djordjevic'
 */
export function foldForSearch(input: string): string {
  // lowercase pre mapiranja pokriva i velika ćirilična/latinična slova (Ђ→ђ→dj, Đ→đ→dj, Ǆ/ǅ→ǆ→dz)
  const lower = input.toLowerCase();
  let out = '';
  for (const ch of lower) {
    out += CYRILLIC_MAP[ch] ?? LATIN_MAP[ch] ?? ch;
  }
  // NFD strip za preostalu dijakritiku (š→s, č→c, ć→c, ž→z, é→e…)
  out = out.normalize('NFD').replace(COMBINING_MARKS, '');
  return out.replace(/\s+/g, ' ').trim();
}

/**
 * Da li osoba odgovara upitu: SVAKA reč upita mora biti podstring
 * foldovane konkatenacije "first_name last_name maiden_name".
 * Prazan upit → false.
 */
export function personMatchesQuery(
  person: { first_name: string; last_name: string; maiden_name: string | null },
  query: string,
): boolean {
  const words = foldForSearch(query).split(' ').filter((w) => w.length > 0);
  if (words.length === 0) return false;
  const haystack = foldForSearch(
    `${person.first_name} ${person.last_name} ${person.maiden_name ?? ''}`,
  );
  return words.every((w) => haystack.includes(w));
}
