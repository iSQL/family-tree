import { describe, expect, it } from 'vitest';
import type { Gender, PersonSlim, TreeResponse, Union } from './types';
import { ancestorIds, posterSubtree } from './posterScope';

function person(
  id: number,
  opts: { gender?: Gender; father?: number | null; mother?: number | null; head?: boolean } = {},
): PersonSlim {
  return {
    id,
    first_name: `P${id}`,
    last_name: 'X',
    maiden_name: null,
    gender: opts.gender ?? 'U',
    title: null,
    birth_date: null,
    death_date: null,
    photo_id: null,
    birth_place: null,
    father_id: opts.father ?? null,
    mother_id: opts.mother ?? null,
    is_family_head: opts.head ?? false,
  };
}

let uid = 1;
function union(a: number, b: number): Union {
  const [p1, p2] = a < b ? [a, b] : [b, a];
  return { id: uid++, partner1_id: p1, partner2_id: p2, type: 'marriage', start_date: null, end_date: null, end_reason: null, notes: null };
}

const tree = (persons: PersonSlim[], unions: Union[] = []): TreeResponse => ({ persons, unions });

// Tri generacije: deda+baba (1,2) → otac (3) + majka (4, priženjena) → deca (5,6);
// 6 ima supružnika 7 i dete 8.
const t3 = tree(
  [
    person(1, { gender: 'M' }),
    person(2, { gender: 'F' }),
    person(3, { gender: 'M', father: 1, mother: 2 }),
    person(4, { gender: 'F' }),
    person(5, { gender: 'M', father: 3, mother: 4 }),
    person(6, { gender: 'F', father: 3, mother: 4 }),
    person(7, { gender: 'M' }),
    person(8, { gender: 'U', father: 7, mother: 6 }),
  ],
  [union(1, 2), union(3, 4), union(6, 7)],
);

describe('ancestorIds', () => {
  it('glavna osoba + lanac predaka, bez supružnika i potomaka', () => {
    expect([...ancestorIds(t3, 5)].sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5]);
  });

  it('koren nema predaka → samo on', () => {
    expect([...ancestorIds(t3, 1)]).toEqual([1]);
  });

  it('nepostojeća osoba → prazan skup', () => {
    expect(ancestorIds(t3, 999).size).toBe(0);
  });
});

describe('posterSubtree', () => {
  it("scope 'ancestors' — preci od 8: roditelji 7 i 6, pa preci od 6", () => {
    const sub = posterSubtree(t3, 'ancestors', 8);
    expect(sub.persons.map((p) => p.id)).toEqual([1, 2, 3, 4, 6, 7, 8]);
    // union(6,7) ostaje (oba unutra), union(1,2) i union(3,4) takođe.
    expect(sub.unions).toHaveLength(3);
  });

  it("scope 'descendants' — potomci od 3 + supružnici potomaka", () => {
    const sub = posterSubtree(t3, 'descendants', 3);
    const ids = sub.persons.map((p) => p.id);
    expect(ids).toEqual([3, 4, 5, 6, 7, 8]); // 4 i 7 kao supružnici, bez predaka (1,2)
  });

  it("scope 'lineage' — cela povezana komponenta", () => {
    const sub = posterSubtree(t3, 'lineage', 5);
    expect(sub.persons).toHaveLength(8);
    expect(sub.unions).toHaveLength(3);
  });

  it("scope 'view' — kao 'lineage': cela povezana komponenta (dubinu seče layout)", () => {
    const sub = posterSubtree(t3, 'view', 5);
    expect(sub.persons).toHaveLength(8);
  });

  it("scope 'selected' — samo izabrane osobe i unions među njima", () => {
    const sub = posterSubtree(t3, 'selected', 3, new Set([3, 4, 5]));
    expect(sub.persons.map((p) => p.id)).toEqual([3, 4, 5]);
    expect(sub.unions.map((u) => [u.partner1_id, u.partner2_id])).toEqual([[3, 4]]);
  });

  it("scope 'selected' bez izbora — samo glavna osoba", () => {
    const sub = posterSubtree(t3, 'selected', 6);
    expect(sub.persons.map((p) => p.id)).toEqual([6]);
    expect(sub.unions).toHaveLength(0);
  });

  it("scope 'ancestors' izbacuje union čiji je jedan partner van skupa", () => {
    const sub = posterSubtree(t3, 'ancestors', 5);
    // union(6,7) otpada — ni 6 ni 7 nisu preci od 5.
    expect(sub.unions.map((u) => [u.partner1_id, u.partner2_id])).toEqual([
      [1, 2],
      [3, 4],
    ]);
  });
});
