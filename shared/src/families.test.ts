import { describe, expect, it } from 'vitest';
import type { Gender, PersonSlim, TreeResponse, Union } from './types';
import {
  chooserFamilies,
  computeFamilies,
  descendantFamilyIds,
  familyMemberIds,
  filterTreeToFamily,
} from './families';

function person(
  id: number,
  opts: {
    gender?: Gender;
    birth?: string | null;
    father?: number | null;
    mother?: number | null;
    head?: boolean;
  } = {},
): PersonSlim {
  return {
    id,
    first_name: `P${id}`,
    last_name: 'X',
    maiden_name: null,
    gender: opts.gender ?? 'U',
    title: null,
    birth_date: opts.birth ?? null,
    death_date: null,
    photo_id: null,
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

describe('computeFamilies', () => {
  it('jedna komponenta (par + dete) → jedna porodica, predstavnik najstariji root', () => {
    const t = tree(
      [
        person(1, { gender: 'M', birth: '1850' }),
        person(2, { gender: 'F', birth: '1855' }),
        person(3, { father: 1, mother: 2, birth: '1880' }),
      ],
      [union(1, 2)],
    );
    const fams = computeFamilies(t);
    expect(fams).toHaveLength(1);
    expect(fams[0]).toEqual({ representativeId: 1, coFounderId: 2, size: 3, designated: false });
  });

  it('dve nepovezane komponente → dve porodice, veća prva', () => {
    const t = tree([
      person(1, { birth: '1850' }),
      person(2, { father: 1, birth: '1875' }),
      person(3, { father: 1, birth: '1878' }), // komponenta A: 3 člana
      person(10, { birth: '1860' }),
      person(11, { father: 10, birth: '1885' }), // komponenta B: 2 člana
    ]);
    const fams = computeFamilies(t);
    expect(fams).toHaveLength(2);
    expect(fams[0]!.size).toBe(3);
    expect(fams[0]!.representativeId).toBe(1);
    expect(fams[1]!.size).toBe(2);
    expect(fams[1]!.representativeId).toBe(10);
  });

  it('dva osnivačka para spojena brakom dece → jedna porodica', () => {
    // par A: 1+2 → dete 5 ; par B: 3+4 → dete 6 ; 5 i 6 u braku
    const t = tree(
      [
        person(1, { birth: '1850' }),
        person(2, { birth: '1852' }),
        person(3, { birth: '1851' }),
        person(4, { birth: '1853' }),
        person(5, { father: 1, mother: 2, birth: '1880' }),
        person(6, { father: 3, mother: 4, birth: '1882' }),
      ],
      [union(1, 2), union(3, 4), union(5, 6)],
    );
    const fams = computeFamilies(t);
    expect(fams).toHaveLength(1);
    expect(fams[0]!.size).toBe(6);
    expect(fams[0]!.representativeId).toBe(1); // najstariji root (1850)
    expect(fams[0]!.coFounderId).toBe(2); // root-supružnik predstavnika
  });

  it('viseća roditeljska referenca se tretira kao root (nije ivica)', () => {
    // 2 ima father_id 99 koji ne postoji → 2 je sopstvena komponenta i root
    const t = tree([person(1, { birth: '1850' }), person(2, { father: 99, birth: '1900' })]);
    const fams = computeFamilies(t);
    expect(fams).toHaveLength(2);
    expect(fams.map((f) => f.representativeId).sort((a, b) => a - b)).toEqual([1, 2]);
  });

  it('izolovana osoba → porodica veličine 1, bez su-osnivača', () => {
    const t = tree([
      person(1, { birth: '1850' }),
      person(2, { father: 1, birth: '1880' }),
      person(9, { birth: '1990' }), // bez ikakvih veza
    ]);
    const fams = computeFamilies(t);
    const solo = fams.find((f) => f.representativeId === 9)!;
    expect(solo).toEqual({ representativeId: 9, coFounderId: null, size: 1, designated: false });
    expect(fams[fams.length - 1]!.size).toBe(1); // singlton poslednji (sort po veličini)
  });

  it('pri jednakoj veličini: stariji predstavnik prvi', () => {
    const t = tree([
      person(1, { birth: '1900' }),
      person(2, { father: 1, birth: '1930' }),
      person(10, { birth: '1850' }),
      person(11, { father: 10, birth: '1880' }),
    ]);
    const fams = computeFamilies(t);
    expect(fams.map((f) => f.representativeId)).toEqual([10, 1]); // obe veličine 2; 1850 pre 1900
  });

  it('predstavnik je najviši predak i kad osnivač nema datum a dublji root ima', () => {
    // Loza: 1(bez datuma) → 2 → 3 → 4. Na 3. nivou se „doženio" supružnik 8 (root, ima datum).
    // Stari bag: 8 (poznat datum) bi pobedio 1 (null = poslednji). Sada pobeđuje najdublja loza.
    const t = tree(
      [
        person(1, { birth: null }), // osnivač, 1. nivo, nepoznat datum
        person(2, { father: 1, birth: '1900' }), // 2. nivo
        person(3, { father: 2, birth: '1925' }), // 3. nivo
        person(8, { birth: '1928' }), // pridošli supružnik — root sa poznatim datumom
        person(4, { father: 3, mother: 8, birth: '1950' }), // 4. nivo
      ],
      [union(3, 8)],
    );
    const fams = computeFamilies(t);
    expect(fams).toHaveLength(1);
    expect(fams[0]!.representativeId).toBe(1); // najdublja loza, ne supružnik sa 3. nivoa
  });
});

describe('familyMemberIds / filterTreeToFamily', () => {
  const t = tree(
    [
      person(1, { birth: '1850' }),
      person(2, { birth: '1852' }),
      person(3, { father: 1, mother: 2, birth: '1880' }), // ista porodica
      person(9, { birth: '1990' }), // druga (izolovana) porodica
    ],
    [union(1, 2)],
  );

  it('familyMemberIds vraća celu komponentu, ne i tuđe članove', () => {
    expect([...familyMemberIds(t, 3)].sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect([...familyMemberIds(t, 9)]).toEqual([9]);
  });

  it('nepostojeći id → prazan skup', () => {
    expect(familyMemberIds(t, 999).size).toBe(0);
  });

  it('filterTreeToFamily zadržava samo članove i njihove unije', () => {
    const sub = filterTreeToFamily(t, 1);
    expect(sub.persons.map((p) => p.id).sort((a, b) => a - b)).toEqual([1, 2, 3]);
    expect(sub.unions).toHaveLength(1);

    const solo = filterTreeToFamily(t, 9);
    expect(solo.persons.map((p) => p.id)).toEqual([9]);
    expect(solo.unions).toHaveLength(0);
  });
});

describe('označene porodice (is_family_head)', () => {
  // Glavna loza: 1+2 → 3 (tvoja majka) ; majka 3 + muž 4 → 5 (ti).
  // Deda po majci = 10 (+ baba 11) → 3. Sve je jedna komponenta (10 priženjen preko 3).
  const build = (headOn: boolean) =>
    tree(
      [
        person(1, { birth: '1900' }), // očev otac (vrh glavne loze)
        person(2, { birth: '1902' }),
        person(10, { birth: '1905', head: headOn }), // deda po majci
        person(11, { birth: '1908' }), // baba po majci
        person(4, { birth: '1930' }), // tvoj otac (sin 1,2)... ispod
        person(3, { father: 10, mother: 11, birth: '1932' }), // tvoja majka (ćerka dede 10)
        person(5, { father: 4, mother: 3, birth: '1960' }), // ti
      ],
      [union(1, 2), union(10, 11), union(3, 4)],
    );
  // 4 je dete 1,2:
  const t0 = build(false);
  t0.persons.find((p) => p.id === 4)!.father_id = 1;
  t0.persons.find((p) => p.id === 4)!.mother_id = 2;

  it('descendantFamilyIds = glava + potomci + supružnici (ne preci ni rodbina supružnika)', () => {
    const ids = descendantFamilyIds(t0, 10); // deda po majci
    // 10 (glava) + 11 (supruga) + 3 (ćerka) + 4 (zet, supružnik ćerke) + 5 (unuk)
    expect([...ids].sort((a, b) => a - b)).toEqual([3, 4, 5, 10, 11]);
    // NE uključuje 1 i 2 (očeva loza, preci zeta 4)
    expect(ids.has(1)).toBe(false);
    expect(ids.has(2)).toBe(false);
  });

  it('filterTreeToFamily: označena glava → silazna loza; neoznačena osoba → komponenta', () => {
    const tHead = build(true);
    tHead.persons.find((p) => p.id === 4)!.father_id = 1;
    tHead.persons.find((p) => p.id === 4)!.mother_id = 2;

    const lineage = filterTreeToFamily(tHead, 10); // 10 je označen
    expect(lineage.persons.map((p) => p.id).sort((a, b) => a - b)).toEqual([3, 4, 5, 10, 11]);

    const whole = filterTreeToFamily(tHead, 1); // 1 nije označen → cela komponenta
    expect(whole.persons.length).toBe(7);
  });

  it('chooserFamilis: označena glava se pojavljuje kao zasebna „loza" kartica, prva', () => {
    const tHead = build(true);
    tHead.persons.find((p) => p.id === 4)!.father_id = 1;
    tHead.persons.find((p) => p.id === 4)!.mother_id = 2;

    const fams = chooserFamilies(tHead);
    expect(fams[0]).toEqual({ representativeId: 10, coFounderId: 11, size: 5, designated: true });
    // Plus auto kartica cele komponente.
    expect(fams.some((f) => !f.designated && f.size === 7)).toBe(true);
  });

  it('chooserFamilies bez označenih = computeFamilies', () => {
    expect(chooserFamilies(t0)).toEqual(computeFamilies(t0));
  });
});
