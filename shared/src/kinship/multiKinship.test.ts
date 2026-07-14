import { describe, expect, it } from 'vitest';
import type { Gender, PersonSlim, TreeResponse, Union } from '../types';
import { describeKinship, describeKinships } from './index';

function p(
  id: number,
  first_name: string,
  gender: Gender,
  father_id: number | null = null,
  mother_id: number | null = null,
): PersonSlim {
  return {
    id, first_name, last_name: 'X', maiden_name: null, gender, title: null,
    birth_date: null, death_date: null, photo_id: null, birth_place: null,
    father_id, mother_id, is_family_head: false,
  };
}

let uid = 1;
function u(a: number, b: number): Union {
  const [p1, p2] = a < b ? [a, b] : [b, a];
  return { id: uid++, partner1_id: p1, partner2_id: p2, type: 'marriage', start_date: null, end_date: null, end_reason: null, notes: null };
}

const tree = (persons: PersonSlim[], unions: Union[] = []): TreeResponse => ({ persons, unions });

describe('describeKinships — jedna veza', () => {
  // Obični brat od strica: dele SAMO par {1,2}. 3,4 sinovi; 5=dete(3,m1), 6=dete(4,m2).
  const t = tree(
    [
      p(1, 'Deda', 'M'), p(2, 'Baba', 'F'),
      p(3, 'Sin1', 'M', 1, 2), p(4, 'Sin2', 'M', 1, 2),
      p(90, 'Majka1', 'F'), p(91, 'Majka2', 'F'),
      p(5, 'Pera', 'M', 3, 90), p(6, 'Mika', 'M', 4, 91),
      p(99, 'Stranac', 'M'), // bez ijedne veze
    ],
    [u(1, 2), u(3, 90), u(4, 91)],
  );

  it('vraća tačno jednu liniju, bez viaLabel-a', () => {
    const r = describeKinships(t, 5, 6);
    expect(r).toHaveLength(1);
    expect(r[0]!.term).toBe('brat od strica');
    expect(r[0]!.viaLabel).toBeUndefined();
    // primarna linija je identična describeKinship
    expect(r[0]!.description).toBe(describeKinship(t, 5, 6).description);
  });

  it('nepovezane osobe → jedna „nisu u srodstvu" linija', () => {
    const r = describeKinships(t, 5, 99);
    expect(r).toHaveLength(1);
    expect(r[0]!.related).toBe(false);
  });
});

describe('describeKinships — dvostruko srodstvo (dupli rođaci)', () => {
  // Dva brata (3,4 od para {1,2}) žene dve sestre (7,8 od para {5,6}).
  // 9 = dete(3,7), 10 = dete(4,8) → dupli prvi rođaci: i po dedi {1,2} i po babi {5,6}.
  const t = tree(
    [
      p(1, 'DedaA', 'M'), p(2, 'BabaA', 'F'),
      p(3, 'Brat1', 'M', 1, 2), p(4, 'Brat2', 'M', 1, 2),
      p(5, 'DedaB', 'M'), p(6, 'BabaB', 'F'),
      p(7, 'Sestra1', 'F', 5, 6), p(8, 'Sestra2', 'F', 5, 6),
      p(9, 'Ceda', 'M', 3, 7), p(10, 'Milan', 'M', 4, 8),
    ],
    [u(1, 2), u(5, 6), u(3, 7), u(4, 8)],
  );

  it('vraća dve linije, najbliža (očinska) prva, obe 4. koleno', () => {
    const r = describeKinships(t, 9, 10);
    expect(r).toHaveLength(2);
    expect(r.map((x) => x.degree)).toEqual([4, 4]);
    expect(r[0]!.term).toBe('brat od strica'); // po dedi (očeva linija) — primarna
    expect(r[1]!.term).toBe('brat od tetke'); // po babi (majčina linija)
  });

  it('svaka linija ima viaLabel sa svojim parom predaka', () => {
    const r = describeKinships(t, 9, 10);
    expect(r[0]!.viaLabel).toContain('DedaA');
    expect(r[0]!.viaLabel).toContain('BabaA');
    expect(r[1]!.viaLabel).toContain('DedaB');
    expect(r[1]!.viaLabel).toContain('BabaB');
  });

  it('limit=1 vraća samo primarnu liniju', () => {
    expect(describeKinships(t, 9, 10, 1)).toHaveLength(1);
  });
});

describe('describeKinships — cap na 3 (postoje 4 nezavisne linije)', () => {
  // Drugi rođaci koji dele 4 pra-para (GA,GB,GC,GD). Svaki daje po jednu liniju (6. koleno).
  const t = tree(
    [
      // pra-parovi
      p(101, 'GaM', 'M'), p(102, 'GaF', 'F'), // GA
      p(103, 'GbM', 'M'), p(104, 'GbF', 'F'), // GB
      p(105, 'GcM', 'M'), p(106, 'GcF', 'F'), // GC
      p(117, 'GdM', 'M'), p(118, 'GdF', 'F'), // GD
      // deca pra-parova (bake/deke)
      p(111, 'gaX', 'M', 101, 102), p(112, 'gaY', 'M', 101, 102),
      p(113, 'gbX', 'F', 103, 104), p(114, 'gbY', 'F', 103, 104),
      p(115, 'gcX', 'F', 105, 106), p(116, 'gcY', 'M', 105, 106),
      p(107, 'gdX', 'M', 117, 118), p(108, 'gdY', 'F', 117, 118),
      // roditelji
      p(121, 'P1', 'M', 111, 115), // C1 otac (gaX × gcX)
      p(122, 'P2', 'F', 107, 113), // C1 majka (gdX × gbX)
      p(123, 'Q1', 'M', 112, 108), // C2 otac (gaY × gdY)
      p(124, 'Q2', 'F', 116, 114), // C2 majka (gcY × gbY)
      // deca
      p(130, 'C1', 'M', 121, 122),
      p(131, 'C2', 'M', 123, 124),
    ],
    [
      u(101, 102), u(103, 104), u(105, 106), u(117, 118),
      u(111, 115), u(107, 113), u(112, 108), u(116, 114),
      u(121, 122), u(123, 124),
    ],
  );

  it('podrazumevano vraća 3 linije iako ih ima 4', () => {
    const r = describeKinships(t, 130, 131);
    expect(r).toHaveLength(3);
    expect(r.every((x) => x.degree === 6)).toBe(true);
    // dodatne linije nose viaLabel
    expect(r[1]!.viaLabel).toBeTruthy();
    expect(r[2]!.viaLabel).toBeTruthy();
    // primarna ostaje identična describeKinship
    expect(r[0]!.description).toBe(describeKinship(t, 130, 131).description);
  });

  it('limit=4 otkriva sve 4 linije', () => {
    expect(describeKinships(t, 130, 131, 4)).toHaveLength(4);
  });
});
