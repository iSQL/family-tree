/**
 * Čista logika brzog unosa srodnika (dete, supružnik, roditelji, brat/sestra) — bez I/O.
 * Klijent je koristi u panelu brzog unosa; testirana na node-u.
 */
import type { Gender, PersonSlim, TreeResponse, Union } from './types';

export interface PartnerOption {
  person: PersonSlim;
  union: Union;
  /** Brak ima zabeležen kraj (datum ili razlog). */
  ended: boolean;
}

/** Partneri osobe — aktuelni brakovi (bez zabeleženog kraja) pre bivših; inače redosled iz baze. */
export function partnersOf(tree: TreeResponse, personId: number): PartnerOption[] {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const out: PartnerOption[] = [];
  for (const u of tree.unions) {
    const otherId =
      u.partner1_id === personId ? u.partner2_id : u.partner2_id === personId ? u.partner1_id : null;
    if (otherId === null) continue;
    const person = byId.get(otherId);
    if (!person) continue;
    out.push({ person, union: u, ended: u.end_date !== null || u.end_reason !== null });
  }
  // sort je stabilan — u okviru aktuelnih/bivših ostaje redosled iz baze
  return out.sort((a, b) => Number(a.ended) - Number(b.ended));
}

export interface ParentSlots {
  father_id: number | null;
  mother_id: number | null;
}

/**
 * Rasporedi do dva roditelja u slotove otac/majka po polu. Osoba nepoznatog pola
 * (ili drugi roditelj istog pola) zauzima prvo slobodno mesto — prvo otac, pa majka.
 */
export function assignParentSlots(parents: readonly (Pick<PersonSlim, 'id' | 'gender'> | null)[]): ParentSlots {
  const slots: ParentSlots = { father_id: null, mother_id: null };
  const rest: Pick<PersonSlim, 'id' | 'gender'>[] = [];
  for (const p of parents) {
    if (!p) continue;
    if (p.gender === 'M' && slots.father_id === null) slots.father_id = p.id;
    else if (p.gender === 'F' && slots.mother_id === null) slots.mother_id = p.id;
    else rest.push(p);
  }
  for (const p of rest) {
    if (slots.father_id === null) slots.father_id = p.id;
    else if (slots.mother_id === null) slots.mother_id = p.id;
  }
  return slots;
}

/** Podrazumevani pol supružnika — suprotan od osobe; nepoznat ostaje nepoznat. */
export function oppositeGender(g: Gender): Gender {
  return g === 'M' ? 'F' : g === 'F' ? 'M' : 'U';
}

/** Prezime koje dete podrazumevano nasleđuje: očevo, inače prvog poznatog roditelja. */
export function inheritedSurname(
  slots: ParentSlots,
  persons: readonly Pick<PersonSlim, 'id' | 'last_name'>[],
): string {
  for (const id of [slots.father_id, slots.mother_id]) {
    if (id === null) continue;
    const p = persons.find((x) => x.id === id);
    if (p && p.last_name.trim() !== '') return p.last_name;
  }
  return '';
}

/** Linija po kojoj se dodaje brat/sestra: rođeni (oba roditelja) ili polu-brat/sestra. */
export type SiblingLine = 'both' | 'father' | 'mother';

/** Koje linije su moguće — samo po roditeljima koji su upisani. */
export function siblingLines(person: Pick<PersonSlim, 'father_id' | 'mother_id'>): SiblingLine[] {
  const { father_id, mother_id } = person;
  if (father_id !== null && mother_id !== null) return ['both', 'father', 'mother'];
  if (father_id !== null) return ['father'];
  if (mother_id !== null) return ['mother'];
  return [];
}

/** Roditelji novog brata/sestre za izabranu liniju. */
export function siblingParentSlots(
  person: Pick<PersonSlim, 'father_id' | 'mother_id'>,
  line: SiblingLine,
): ParentSlots {
  return {
    father_id: line === 'mother' ? null : person.father_id,
    mother_id: line === 'father' ? null : person.mother_id,
  };
}

/** Prazni roditeljski slotovi osobe. */
export function missingParentSlots(
  person: Pick<PersonSlim, 'father_id' | 'mother_id'>,
): ('father_id' | 'mother_id')[] {
  const out: ('father_id' | 'mother_id')[] = [];
  if (person.father_id === null) out.push('father_id');
  if (person.mother_id === null) out.push('mother_id');
  return out;
}

/** Šta osnovno nedostaje osobi — pol i datum rođenja (za oznaku na kartici i spisak za dopunu). */
export function missingInfo(p: Pick<PersonSlim, 'gender' | 'birth_date'>): ('gender' | 'birth_date')[] {
  const out: ('gender' | 'birth_date')[] = [];
  if (p.gender === 'U') out.push('gender');
  if (p.birth_date === null) out.push('birth_date');
  return out;
}
