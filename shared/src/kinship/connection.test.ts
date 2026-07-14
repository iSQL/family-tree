import { describe, expect, it } from 'vitest';
import type { Gender, PersonSlim, TreeResponse, Union } from '../types';
import { describeKinship, type KinshipResult } from './index';
import { buildConnectionView, hasConnectionView } from './connection';

// ─── Fixture ───
// Živko(1)+Stana(2) → Pera(3), Mika(4)
// Pera(3)+Rada(5) → Ana(6);  Mika(4)+Lepa(7) → Boba(8)
// Ana(6) udata za Muža(9)
// Prija: Dedan(10) → Sin(11); Dedbe(12) → Ćerka(13); Sin+Ćerka u braku
// Žarko(14) = nepovezan
const ZIVKO = 1;
const STANA = 2;
const PERA = 3;
const MIKA = 4;
const RADA = 5;
const ANA = 6;
const LEPA = 7;
const BOBA = 8;
const MUZ = 9;
const DEDAN = 10;
const SIN = 11;
const DEDBE = 12;
const CERKA = 13;
const ZARKO = 14;

function person(
  id: number,
  first_name: string,
  gender: Gender,
  father_id: number | null = null,
  mother_id: number | null = null,
): PersonSlim {
  return {
    id,
    first_name,
    last_name: '',
    maiden_name: null,
    gender,
    title: null,
    birth_date: null,
    death_date: null,
    photo_id: null,
    birth_place: null,
    father_id,
    mother_id,
    is_family_head: false,
  };
}

function union(id: number, partner1_id: number, partner2_id: number): Union {
  return {
    id,
    partner1_id,
    partner2_id,
    type: 'marriage',
    start_date: null,
    end_date: null,
    end_reason: null,
    notes: null,
  };
}

const tree: TreeResponse = {
  persons: [
    person(ZIVKO, 'Živko', 'M'),
    person(STANA, 'Stana', 'F'),
    person(PERA, 'Pera', 'M', ZIVKO, STANA),
    person(MIKA, 'Mika', 'M', ZIVKO, STANA),
    person(RADA, 'Rada', 'F'),
    person(ANA, 'Ana', 'F', PERA, RADA),
    person(LEPA, 'Lepa', 'F'),
    person(BOBA, 'Boba', 'M', MIKA, LEPA),
    person(MUZ, 'Muž', 'M'),
    person(DEDAN, 'Dedan', 'M'),
    person(SIN, 'Sin', 'M', DEDAN, null),
    person(DEDBE, 'Dedbe', 'M'),
    person(CERKA, 'Ćerka', 'F', DEDBE, null),
    person(ZARKO, 'Žarko', 'M'),
  ],
  unions: [
    union(1, ZIVKO, STANA),
    union(2, PERA, RADA),
    union(3, MIKA, LEPA),
    union(4, ANA, MUZ),
    union(5, SIN, CERKA),
  ],
};

function view(a: number, b: number) {
  return buildConnectionView(tree, describeKinship(tree, a, b));
}

function personIds(v: { tree: TreeResponse }): number[] {
  return v.tree.persons.map((p) => p.id).sort((x, y) => x - y);
}

describe('buildConnectionView', () => {
  it('V-putanja (braća/sestre od stričeva): putanja + drugi roditelj na svakom koraku', () => {
    const v = view(ANA, BOBA);
    expect(v).not.toBeNull();
    // Putanja: 6→3→1→4→8; dodati: Rada (majka Ane), Stana (majka Pere i Mike), Lepa (majka Bobe)
    expect(personIds(v!)).toEqual([ZIVKO, STANA, PERA, MIKA, RADA, ANA, LEPA, BOBA]);
    // Prevoj = zajednički predak
    expect(v!.mainId).toBe(ZIVKO);
    // Unions samo među uključenima (bez Ana+Muž i Sin+Ćerka)
    expect(v!.tree.unions.map((u) => u.id).sort()).toEqual([1, 2, 3]);
  });

  it('tazbina (supružnička ivica na kraju): supružnik je uključen, prevoj ostaje predak', () => {
    const v = view(MUZ, ZIVKO);
    expect(v).not.toBeNull();
    // Putanja: 9→6→3→1; dodate majke: Rada, Stana
    expect(personIds(v!)).toEqual([ZIVKO, STANA, PERA, RADA, ANA, MUZ]);
    expect(v!.mainId).toBe(ZIVKO);
    // Union Ana+Muž sada ulazi (oba partnera u podskupu)
    expect(v!.tree.unions.map((u) => u.id).sort()).toEqual([1, 2, 4]);
  });

  it('čisto uzlazna veza: predak je glavna osoba', () => {
    const v = view(ANA, ZIVKO);
    expect(v).not.toBeNull();
    expect(personIds(v!)).toEqual([ZIVKO, STANA, PERA, RADA, ANA]);
    expect(v!.mainId).toBe(ZIVKO);
  });

  it('čisto silazna veza: polazna osoba je glavna', () => {
    const v = view(ZIVKO, ANA);
    expect(v).not.toBeNull();
    expect(v!.mainId).toBe(ZIVKO);
  });

  it('prija (supružnička ivica u sredini) nema prikaz', () => {
    const result = describeKinship(tree, DEDAN, DEDBE);
    expect(result.term).toBe('prijatelj');
    expect(hasConnectionView(result)).toBe(false);
    expect(buildConnectionView(tree, result)).toBeNull();
  });

  it('bez srodstva i za istu osobu nema prikaza', () => {
    expect(view(ANA, ZARKO)).toBeNull();
    expect(view(ANA, ANA)).toBeNull();
  });

  it('roditelj van stabla se preskače (viseća referenca)', () => {
    const half: KinshipResult = describeKinship(tree, SIN, DEDAN);
    // Sin ima samo oca — nema majke za dodavanje; prikaz i dalje radi
    const v = buildConnectionView(tree, half);
    expect(v).not.toBeNull();
    expect(personIds(v!)).toEqual([DEDAN, SIN]);
    expect(v!.mainId).toBe(DEDAN);
  });
});
