import { describe, expect, it } from 'vitest';
import type { PersonSlim, TreeResponse, Union } from './types';
import {
  assignParentSlots,
  inheritedSurname,
  missingInfo,
  missingParentSlots,
  oppositeGender,
  partnersOf,
  siblingLines,
  siblingParentSlots,
} from './quickAdd';

const person = (id: number, extra: Partial<PersonSlim> = {}): PersonSlim => ({
  id,
  first_name: `Osoba${id}`,
  last_name: 'Petrović',
  maiden_name: null,
  gender: 'U',
  title: null,
  birth_date: null,
  death_date: null,
  birth_place: null,
  photo_id: null,
  father_id: null,
  mother_id: null,
  is_family_head: false,
  ...extra,
});

const union = (id: number, a: number, b: number, extra: Partial<Union> = {}): Union => ({
  id,
  partner1_id: Math.min(a, b),
  partner2_id: Math.max(a, b),
  type: 'marriage',
  start_date: null,
  end_date: null,
  end_reason: null,
  notes: null,
  ...extra,
});

describe('partnersOf', () => {
  it('stavlja aktuelni brak pre bivšeg, bez obzira na redosled u bazi', () => {
    const tree: TreeResponse = {
      persons: [person(1, { gender: 'M' }), person(2, { gender: 'F' }), person(3, { gender: 'F' })],
      unions: [union(10, 1, 2, { end_reason: 'divorce' }), union(11, 1, 3)],
    };
    const res = partnersOf(tree, 1);
    expect(res.map((p) => [p.person.id, p.ended])).toEqual([
      [3, false],
      [2, true],
    ]);
  });

  it('preskače brakove sa nepostojećom osobom', () => {
    const tree: TreeResponse = { persons: [person(1)], unions: [union(10, 1, 99)] };
    expect(partnersOf(tree, 1)).toEqual([]);
  });
});

describe('assignParentSlots', () => {
  it('raspoređuje po polu', () => {
    expect(assignParentSlots([person(2, { gender: 'F' }), person(1, { gender: 'M' })])).toEqual({
      father_id: 1,
      mother_id: 2,
    });
  });

  it('jedan roditelj nepoznatog pola ide na mesto oca', () => {
    expect(assignParentSlots([person(5), null])).toEqual({ father_id: 5, mother_id: null });
  });

  it('nepoznat pol popunjava preostalo mesto', () => {
    expect(assignParentSlots([person(1, { gender: 'M' }), person(2)])).toEqual({
      father_id: 1,
      mother_id: 2,
    });
  });
});

describe('ostali pomoćnici', () => {
  it('oppositeGender', () => {
    expect([oppositeGender('M'), oppositeGender('F'), oppositeGender('U')]).toEqual(['F', 'M', 'U']);
  });

  it('inheritedSurname uzima očevo, pa majčino prezime', () => {
    const persons = [person(1, { last_name: '' }), person(2, { last_name: 'Jovanović' })];
    expect(inheritedSurname({ father_id: 1, mother_id: 2 }, persons)).toBe('Jovanović');
    expect(inheritedSurname({ father_id: null, mother_id: null }, persons)).toBe('');
  });

  it('siblingLines i siblingParentSlots', () => {
    const both = person(3, { father_id: 1, mother_id: 2 });
    expect(siblingLines(both)).toEqual(['both', 'father', 'mother']);
    expect(siblingLines(person(4, { mother_id: 2 }))).toEqual(['mother']);
    expect(siblingLines(person(5))).toEqual([]);
    expect(siblingParentSlots(both, 'both')).toEqual({ father_id: 1, mother_id: 2 });
    expect(siblingParentSlots(both, 'father')).toEqual({ father_id: 1, mother_id: null });
    expect(siblingParentSlots(both, 'mother')).toEqual({ father_id: null, mother_id: 2 });
  });

  it('missingParentSlots i missingInfo', () => {
    expect(missingParentSlots(person(1, { father_id: 7 }))).toEqual(['mother_id']);
    expect(missingInfo(person(1))).toEqual(['gender', 'birth_date']);
    expect(missingInfo(person(1, { gender: 'F', birth_date: '1950' }))).toEqual([]);
  });
});
