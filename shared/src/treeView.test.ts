import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PROGENY_DEPTH,
  LARGE_TREE_THRESHOLD,
  maxDescendantDepth,
  resolveProgenyDepth,
} from './treeView';

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
