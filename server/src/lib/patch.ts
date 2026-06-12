/**
 * Zod .default() u .partial() šemama upisuje podrazumevanu vrednost i za NEDOSTAJUĆE
 * ključeve (npr. last_name → '', type → 'marriage'). Ugovorne šeme su zamrznute,
 * pa PATCH semantiku ("nedostajući ključevi se ne diraju") čuvamo ovde: iz parsiranog
 * rezultata zadržavamo samo ključeve koji su zaista bili prisutni u telu zahteva.
 */
export function onlyPresentKeys<T extends Record<string, unknown>>(parsed: T, rawBody: unknown): Partial<T> {
  if (typeof rawBody !== 'object' || rawBody === null) return parsed;
  const present = new Set(Object.keys(rawBody));
  return Object.fromEntries(Object.entries(parsed).filter(([key]) => present.has(key))) as Partial<T>;
}
