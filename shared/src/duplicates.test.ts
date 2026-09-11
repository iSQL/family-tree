import { describe, expect, it } from 'vitest';
import { findPossibleDuplicates, nameWithYear, type DuplicateCandidate } from './duplicates';

const person = (id: number, first_name: string, extra: Partial<DuplicateCandidate> = {}) => ({
  id,
  first_name,
  last_name: 'Petrović',
  maiden_name: null,
  gender: 'U' as const,
  birth_date: null,
  ...extra,
});

describe('findPossibleDuplicates', () => {
  const persons = [
    person(1, 'Đorđe', { gender: 'M', birth_date: '1950-02-01' }),
    person(2, 'Milica', { gender: 'F', last_name: 'Jovanović', maiden_name: 'Petrović', birth_date: '1980' }),
    person(3, 'Đorđe', { gender: 'M', birth_date: '1990' }),
  ];

  it('poklapa ime bez dijakritika i godinu rođenja ±2', () => {
    const found = findPossibleDuplicates(persons, {
      first_name: 'Djordje',
      last_name: 'Petrovic',
      maiden_name: null,
      gender: 'U',
      birth_date: '1952',
    });
    expect(found.map((p) => p.id)).toEqual([1]);
  });

  it('poklapa devojačko prezime i ne meša polove', () => {
    const base = { first_name: 'Milica', last_name: 'Petrović', maiden_name: null, birth_date: null };
    expect(findPossibleDuplicates(persons, { ...base, gender: 'F' }).map((p) => p.id)).toEqual([2]);
    expect(findPossibleDuplicates(persons, { ...base, gender: 'M' })).toEqual([]);
  });

  it('bez prezimena na samo jednoj strani nije duplikat', () => {
    expect(
      findPossibleDuplicates(persons, { first_name: 'Đorđe', last_name: '', maiden_name: null, gender: 'M', birth_date: null }),
    ).toEqual([]);
  });
});

describe('nameWithYear', () => {
  it('dodaje godinu rođenja kad je poznata', () => {
    expect(nameWithYear({ first_name: 'Ana', last_name: 'Ilić', birth_date: '1956-03-15' })).toBe('Ana Ilić (1956)');
    expect(nameWithYear({ first_name: 'Ana', last_name: '', birth_date: null })).toBe('Ana');
  });
});
