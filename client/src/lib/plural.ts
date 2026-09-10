/** Tri oblika imenice uz broj: [1, 2–4, 5+], npr. ['osoba', 'osobe', 'osoba']. */
export type PluralForms = readonly [one: string, few: string, many: string];

/** Srpski oblik uz broj: 1/21 osoba, 2–4/22–24 osobe, 5–20/25+ osoba (11–14 uvek treći oblik). */
export function plural(n: number, [one, few, many]: PluralForms): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

/** '3 osobe', '1 brak'… */
export function countOf(n: number, forms: PluralForms): string {
  return `${n} ${plural(n, forms)}`;
}
