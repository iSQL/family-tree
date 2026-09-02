import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGENY_DEPTH,
  LARGE_TREE_THRESHOLD,
  collectBranchIds,
  collectProtectedIds,
  hidePersonsFromTree,
  maxDescendantDepth,
  resolveProgenyDepth,
} from './treeView';
import type { PersonSlim, TreeResponse, Union } from './types';

type P = { id: number; father_id: number | null; mother_id: number | null };
const person = (id: number, father: number | null = null, mother: number | null = null): P => ({
  id,
  father_id: father,
  mother_id: mother,
});

describe('maxDescendantDepth', () => {
  it('list (bez dece) → 0', () => {
    expect(maxDescendantDepth([person(1)], 1)).toBe(0);
  });

  it('lanac dede → oca → unuka → 2', () => {
    const persons = [person(1), person(2, 1), person(3, 2)];
    expect(maxDescendantDepth(persons, 1)).toBe(2);
    expect(maxDescendantDepth(persons, 2)).toBe(1);
    expect(maxDescendantDepth(persons, 3)).toBe(0);
  });

  it('uzima najdužu granu', () => {
    // 1 → 2 → 4 ; 1 → 3 (3 nema dece)
    const persons = [person(1), person(2, 1), person(3, 1), person(4, 2)];
    expect(maxDescendantDepth(persons, 1)).toBe(2);
  });

  it('koren bez potomaka i nepostojeći koren → 0', () => {
    expect(maxDescendantDepth([person(1), person(2)], 2)).toBe(0);
    expect(maxDescendantDepth([person(1)], 999)).toBe(0);
  });

  it('DAG (zajedničko dete dva potomka) ne pukne i daje tačnu dubinu', () => {
    // 1 → 2, 1 → 3, a 4 je dete i 2 i 3 (brak među potomcima); 4 → 5
    const persons = [person(1), person(2, 1), person(3, 1), person(4, 2, 3), person(5, 4)];
    expect(maxDescendantDepth(persons, 1)).toBe(3); // 1→2→4→5
  });
});

describe('resolveProgenyDepth', () => {
  it('malo stablo bez parametra → svi potomci (= max)', () => {
    expect(resolveProgenyDepth(10, null, 4)).toBe(4);
    expect(resolveProgenyDepth(LARGE_TREE_THRESHOLD, undefined, 2)).toBe(2);
  });

  it('veliko stablo bez parametra → podrazumevani, kratko na max', () => {
    expect(resolveProgenyDepth(LARGE_TREE_THRESHOLD + 1, null, 10)).toBe(DEFAULT_PROGENY_DEPTH);
    expect(resolveProgenyDepth(5000, null, 1)).toBe(1); // max manji od podrazumevanog
  });

  it('eksplicitna vrednost pobeđuje, ali se kratko na max', () => {
    expect(resolveProgenyDepth(5000, 2, 6)).toBe(2);
    expect(resolveProgenyDepth(5000, 99, 6)).toBe(6); // preko maksimuma → max
    expect(resolveProgenyDepth(10, 0, 4)).toBe(0); // 0 = samo glavna osoba
  });

  it('nevalidan parametar → kao nezadat', () => {
    expect(resolveProgenyDepth(5000, -1, 8)).toBe(DEFAULT_PROGENY_DEPTH);
    expect(resolveProgenyDepth(10, 2.5, 4)).toBe(4);
  });
});

describe('hidePersonsFromTree', () => {
  const slim = (id: number, father: number | null = null, mother: number | null = null): PersonSlim => ({
    id,
    first_name: `Osoba${id}`,
    last_name: 'Test',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    photo_id: null,
    father_id: father,
    mother_id: mother,
    is_family_head: false,
  });
  const union = (id: number, a: number, b: number): Union => ({
    id,
    partner1_id: a,
    partner2_id: b,
    type: 'marriage',
    start_date: null,
    end_date: null,
    end_reason: null,
    notes: null,
  });

  it('prazan skup → isti objekat (bez kopiranja)', () => {
    const tree: TreeResponse = { persons: [slim(1)], unions: [] };
    expect(hidePersonsFromTree(tree, new Set())).toBe(tree);
  });

  it('uklanja osobu i brakove koji je dodiruju, ostale ne dira', () => {
    const tree: TreeResponse = {
      persons: [slim(1), slim(2), slim(3, 1, 2)],
      unions: [union(1, 1, 2), union(2, 2, 3)],
    };
    const out = hidePersonsFromTree(tree, new Set([2]));
    expect(out.persons.map((p) => p.id)).toEqual([1, 3]);
    expect(out.unions.map((u) => u.id)).toEqual([]);
    // izvorno stablo netaknuto
    expect(tree.persons).toHaveLength(3);
  });

  it('roditeljske reference ka skrivenoj osobi ostaju (toF3 ih preskače)', () => {
    const tree: TreeResponse = { persons: [slim(1), slim(2, 1, null)], unions: [] };
    const out = hidePersonsFromTree(tree, new Set([1]));
    expect(out.persons).toHaveLength(1);
    expect(out.persons[0]!.father_id).toBe(1);
  });

  // Porodica za testove grane: deda 1 + baba 2 → sin 3 (žena 4) i ćerka 7;
  // deca sina: 5 i 6. Glavna osoba = 5.
  const family: TreeResponse = {
    persons: [
      slim(1),
      slim(2),
      slim(3, 1, 2),
      slim(4),
      slim(5, 3, 4),
      slim(6, 3, 4),
      slim(7, 1, 2),
    ],
    unions: [union(1, 1, 2), union(2, 3, 4)],
  };

  describe('collectProtectedIds', () => {
    it('glavna osoba + svi preci', () => {
      expect([...collectProtectedIds(family, 5)].sort()).toEqual([1, 2, 3, 4, 5]);
      expect([...collectProtectedIds(family, 1)]).toEqual([1]);
    });
  });

  describe('collectBranchIds', () => {
    it('grana = osoba + supružnik + potomci, zaštićeni se preskaču', () => {
      // Grana strica/tetke 7 iz ugla glavne osobe 5 — samo ona (nema supružnika ni dece).
      expect(collectBranchIds(family, 7, 5)).toEqual([7]);
      // Grana brata 6 — samo on.
      expect(collectBranchIds(family, 6, 5)).toEqual([6]);
      // Iz ugla glavne osobe 1: grana sina 3 nosi ženu 4 i decu 5 i 6.
      expect(collectBranchIds(family, 3, 1)?.sort()).toEqual([3, 4, 5, 6]);
    });

    it('glavna osoba i preci → null', () => {
      expect(collectBranchIds(family, 5, 5)).toBeNull();
      expect(collectBranchIds(family, 3, 5)).toBeNull(); // otac glavne
      expect(collectBranchIds(family, 1, 5)).toBeNull(); // deda glavne
      expect(collectBranchIds(family, 999, 5)).toBeNull(); // nepostojeća osoba
    });

    it('obilazak preko braka ne uvlači zaštićene', () => {
      // Iz ugla glavne 6: grana brata 5 ne sme da povuče roditelje 3/4.
      expect(collectBranchIds(family, 5, 6)).toEqual([5]);
    });
  });
});
