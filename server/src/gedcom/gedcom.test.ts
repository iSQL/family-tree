import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Person, Union } from '@shared/types';
import { serializeGedcom } from './export';
import { parseGedcom } from './import';

// ---------- pomoćni graditelji fixture-a ----------

const NOW = '2026-01-01 00:00:00';

function person(p: Partial<Person> & Pick<Person, 'id' | 'first_name'>): Person {
  return {
    last_name: '',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    photo_id: null,
    father_id: null,
    mother_id: null,
    birth_place: null,
    notes: null,
    gedcom_xref: null,
    created_at: NOW,
    updated_at: NOW,
    ...p,
  };
}

function union(u: Partial<Union> & Pick<Union, 'id' | 'partner1_id' | 'partner2_id'>): Union {
  return {
    type: 'marriage',
    start_date: null,
    end_date: null,
    end_reason: null,
    notes: null,
    ...u,
  };
}

// dug red za CONC prelom (>200 karaktera, ne završava se razmakom)
const LONG_LINE = 'ŠĐČĆŽ proba duge beleške broj '.repeat(18) + 'kraj';

// 3 generacije: deda+baba, razvod + ponovni brak, polubraća, jednoroditeljski par, partnerstvo
const PERSONS: Person[] = [
  person({
    id: 1, first_name: 'Đorđe', last_name: 'Đorđević', gender: 'M', title: 'prof. dr',
    birth_date: '1932-05-04', birth_place: 'Niš', death_date: '1998',
  }),
  person({
    id: 2, first_name: 'Živana', last_name: 'Đorđević', maiden_name: 'Šćepanović', gender: 'F',
    birth_date: '1936-11', notes: 'Volela je da peva.\nDruga linija.',
  }),
  person({ id: 3, first_name: 'Čedomir', last_name: 'Đorđević', gender: 'M', birth_date: '1957-08-21', father_id: 1, mother_id: 2 }),
  person({ id: 4, first_name: 'Žaklina', last_name: 'Đorđević', maiden_name: 'Ćirić', gender: 'F' }),
  person({ id: 5, first_name: 'Svetlana', last_name: 'Đorđević', gender: 'F' }),
  person({ id: 6, first_name: 'Miloš', last_name: 'Đorđević', gender: 'M', birth_date: '1982', father_id: 3, mother_id: 4 }),
  person({ id: 7, first_name: 'Đura', last_name: 'Đorđević', gender: 'M', birth_date: '1993-07-01', father_id: 3, mother_id: 5 }),
  person({ id: 8, first_name: 'Snežana', last_name: 'Šojić', gender: 'F' }),
  person({ id: 9, first_name: 'Vuk', last_name: 'Šojić', gender: 'M', mother_id: 8, notes: `Prvi red.\n${LONG_LINE}` }),
  person({ id: 10, first_name: 'Lela', last_name: 'Spasojević', gender: 'U' }),
];

const UNIONS: Union[] = [
  union({ id: 1, partner1_id: 1, partner2_id: 2, start_date: '1956-03-15' }),
  union({ id: 2, partner1_id: 3, partner2_id: 4, start_date: '1980-06-01', end_date: '1990-02-10', end_reason: 'divorce' }),
  union({ id: 3, partner1_id: 3, partner2_id: 5, start_date: '1992-09-05' }),
  union({ id: 4, partner1_id: 6, partner2_id: 10, type: 'partnership' }),
];

describe('serializeGedcom', () => {
  const ged = serializeGedcom(PERSONS, UNIONS);

  it('proizvodi validnu 5.5.1 strukturu sa HEAD i TRLR', () => {
    expect(ged.startsWith('0 HEAD\n')).toBe(true);
    expect(ged).toContain('1 SOUR family-tree');
    expect(ged).toContain('2 VERS 5.5.1');
    expect(ged).toContain('2 FORM LINEAGE-LINKED');
    expect(ged).toContain('1 CHAR UTF-8');
    expect(ged.trimEnd().endsWith('0 TRLR')).toBe(true);
  });

  it('serijalizuje imena, devojačko prezime, titulu i sva 3 oblika datuma', () => {
    expect(ged).toContain('1 NAME Đorđe /Đorđević/');
    expect(ged).toContain('1 NAME Živana /Šćepanović/');
    expect(ged).toContain('2 TYPE maiden');
    expect(ged).toContain('1 TITL prof. dr');
    expect(ged).toContain('2 DATE 4 MAY 1932'); // pun datum
    expect(ged).toContain('2 DATE NOV 1936'); // godina-mesec
    expect(ged).toContain('2 DATE 1998'); // samo godina (smrt)
    expect(ged).toContain('2 PLAC Niš');
  });

  it('serijalizuje brak, razvod i partnerstvo (bez MARR)', () => {
    expect(ged).toContain('2 DATE 15 MAR 1956');
    expect(ged).toContain('1 DIV');
    expect(ged).toContain('2 DATE 10 FEB 1990');
    // partnerstvo Miloš+Lela: FAM @F4@ bez MARR taga
    const f4 = ged.split('0 @F4@ FAM\n')[1]!.split('\n0 ')[0]!;
    expect(f4).not.toContain('MARR');
    expect(f4).toContain('1 HUSB @I6@');
    expect(f4).toContain('1 WIFE @I10@');
  });

  it('pravi FAM za jednoroditeljski par koji nije pokriven unionom', () => {
    const f5 = ged.split('0 @F5@ FAM\n')[1]!.split('\n0 ')[0]!;
    expect(f5).toContain('1 WIFE @I8@');
    expect(f5).not.toContain('HUSB');
    expect(f5).toContain('1 CHIL @I9@');
  });

  it('lomi dugačke beleške kroz CONT/CONC', () => {
    expect(ged).toContain('1 NOTE Volela je da peva.');
    expect(ged).toContain('2 CONT Druga linija.');
    expect(ged).toContain('2 CONC ');
  });
});

describe('round-trip: serializeGedcom → parseGedcom', () => {
  const ged = serializeGedcom(PERSONS, UNIONS);
  const result = parseGedcom(Buffer.from(ged, 'utf8'));
  const byXref = new Map(result.persons.map(p => [p.xref, p]));

  it('parsira sopstveni izlaz bez ijednog upozorenja', () => {
    expect(result.warnings).toEqual([]);
    expect(result.persons).toHaveLength(10);
    expect(result.unions).toHaveLength(5); // 4 union-a + 1 jednoroditeljski FAM
  });

  it('čuva imena sa ŠĐČĆŽ, pol, titulu i devojačko prezime', () => {
    const deda = byXref.get('@I1@')!;
    expect(deda.first_name).toBe('Đorđe');
    expect(deda.last_name).toBe('Đorđević');
    expect(deda.gender).toBe('M');
    expect(deda.title).toBe('prof. dr');

    const baba = byXref.get('@I2@')!;
    expect(baba.first_name).toBe('Živana');
    expect(baba.last_name).toBe('Đorđević');
    expect(baba.maiden_name).toBe('Šćepanović');
    expect(baba.gender).toBe('F');

    expect(byXref.get('@I4@')!.maiden_name).toBe('Ćirić');
    expect(byXref.get('@I10@')!.gender).toBe('U');
  });

  it('čuva parcijalne datume u sva 3 oblika i pokojnika', () => {
    const deda = byXref.get('@I1@')!;
    expect(deda.birth_date).toBe('1932-05-04');
    expect(deda.birth_place).toBe('Niš');
    expect(deda.death_date).toBe('1998'); // pokojnik, samo godina
    expect(byXref.get('@I2@')!.birth_date).toBe('1936-11');
    expect(byXref.get('@I6@')!.birth_date).toBe('1982');
    expect(byXref.get('@I7@')!.birth_date).toBe('1993-07-01');
  });

  it('rekonstruiše roditeljske veze, polubrata i jednoroditeljski par', () => {
    const otac = byXref.get('@I3@')!;
    expect(otac.father_xref).toBe('@I1@');
    expect(otac.mother_xref).toBe('@I2@');

    // polubraća: isti otac, različite majke
    const milos = byXref.get('@I6@')!;
    const djura = byXref.get('@I7@')!;
    expect(milos.father_xref).toBe('@I3@');
    expect(milos.mother_xref).toBe('@I4@');
    expect(djura.father_xref).toBe('@I3@');
    expect(djura.mother_xref).toBe('@I5@');

    // jednoroditeljski par: samo majka
    const vuk = byXref.get('@I9@')!;
    expect(vuk.father_xref).toBeNull();
    expect(vuk.mother_xref).toBe('@I8@');
  });

  it('rekonstruiše brakove, razvod, ponovni brak i partnerstvo', () => {
    const find = (a: string, b: string) =>
      result.unions.find(
        u => (u.partner1_xref === a && u.partner2_xref === b) || (u.partner1_xref === b && u.partner2_xref === a),
      );

    const u1 = find('@I1@', '@I2@')!;
    expect(u1.type).toBe('marriage');
    expect(u1.start_date).toBe('1956-03-15');
    expect(u1.end_reason).toBeNull();

    const u2 = find('@I3@', '@I4@')!;
    expect(u2.type).toBe('marriage');
    expect(u2.start_date).toBe('1980-06-01');
    expect(u2.end_reason).toBe('divorce');
    expect(u2.end_date).toBe('1990-02-10');

    const u3 = find('@I3@', '@I5@')!; // ponovni brak
    expect(u3.type).toBe('marriage');
    expect(u3.start_date).toBe('1992-09-05');

    const u4 = find('@I6@', '@I10@')!;
    expect(u4.type).toBe('partnership');
    expect(u4.start_date).toBeNull();

    // jednoroditeljski FAM daje draft sa jednom praznom stranom — server ga preskače
    const single = result.unions.find(u => u.partner1_xref === null);
    expect(single?.partner2_xref).toBe('@I8@');
  });

  it('čuva beleške sa novim redom i dugim redom (CONT/CONC)', () => {
    expect(byXref.get('@I2@')!.notes).toBe('Volela je da peva.\nDruga linija.');
    expect(byXref.get('@I9@')!.notes).toBe(`Prvi red.\n${LONG_LINE}`);
  });
});

describe('parseGedcom: GEDCOM datumi', () => {
  it('ABT datum daje vrednost uz warning', () => {
    const ged = [
      '0 HEAD',
      '1 GEDC',
      '2 VERS 5.5.1',
      '1 CHAR UTF-8',
      '0 @I1@ INDI',
      '1 NAME Ana /Babić/',
      '1 BIRT',
      '2 DATE ABT MAR 1956',
      '0 TRLR',
      '',
    ].join('\n');
    const result = parseGedcom(ged); // string ulaz
    expect(result.persons[0]!.birth_date).toBe('1956-03');
    expect(result.warnings).toContainEqual({ tag: 'ABT', count: 1, sample: 'ABT MAR 1956' });
  });
});

describe('parseGedcom: strani fajl sa nepodržanim tagovima', () => {
  const buffer = readFileSync(new URL('./__fixtures__/foreign.ged', import.meta.url));
  const result = parseGedcom(buffer);
  const byXref = new Map(result.persons.map(p => [p.xref, p]));
  const warnByTag = new Map(result.warnings.map(w => [w.tag, w]));

  it('ne puca i parsira sve osobe', () => {
    expect(result.persons).toHaveLength(4);
    expect(result.unions).toHaveLength(1);
  });

  it('agregira nepodržane tagove u warnings', () => {
    expect(warnByTag.get('SOUR')?.count).toBe(3); // NAME.SOUR + BIRT.SOUR + level-0 zapis
    expect(warnByTag.get('BAPM')?.count).toBe(1);
    expect(warnByTag.get('OBJE')?.count).toBe(1);
    expect(warnByTag.get('SUBM')?.count).toBe(1);
    expect(warnByTag.get('SLGS')?.count).toBe(1);
    expect(warnByTag.get('PLAC')?.count).toBe(1); // PLAC pod MARR ne podržavamo
  });

  it('kvalifikatore i opsege datuma prevodi po pravilima', () => {
    const john = byXref.get('@I1@')!;
    expect(john.birth_date).toBe('1900'); // ABT 1900 → godina + warning
    expect(warnByTag.get('ABT')?.sample).toBe('ABT 1900');
    expect(john.death_date).toBeNull(); // BEF 1980 → null + warning
    expect(warnByTag.get('BEF')?.count).toBe(1);
    expect(byXref.get('@I2@')!.birth_date).toBeNull(); // BET … AND … → null + warning
    expect(warnByTag.get('BET')?.count).toBe(1);
    expect(byXref.get('@I3@')!.birth_date).toBeNull(); // nevalidan datum
    expect(warnByTag.get('DATE')?.sample).toBe('SOMETIME IN SPRING');
  });

  it('ljudski vredne tagove dopisuje u notes, NOTE spaja CONT/CONC i reference', () => {
    const john = byXref.get('@I1@')!;
    expect(john.notes).toContain('Zanimanje: Carpenter');
    expect(john.notes).toContain('Nadimak: Johnny');
    expect(john.notes).toContain('Veroispovest: Anglican');
    expect(john.notes).toContain('Some note\ncontinued line with concatenation');

    const mary = byXref.get('@I2@')!;
    expect(mary.notes).toContain('Obrazovanje: Oxford');
    expect(mary.notes).toContain('Shared note text'); // NOTE preko @N1@ reference
  });

  it('drugi NAME sa TYPE maiden daje devojačko prezime, UTF-8 imena rade', () => {
    const mary = byXref.get('@I2@')!;
    expect(mary.last_name).toBe('Smith');
    expect(mary.maiden_name).toBe('Brown');
    expect(byXref.get('@I3@')!.first_name).toBe('Đorđe');
  });

  it('roditelje izvodi iz FAMC, a bez FAMC iz CHIL veze', () => {
    const child = byXref.get('@I3@')!; // ima FAMC
    expect(child.father_xref).toBe('@I1@');
    expect(child.mother_xref).toBe('@I2@');
    const jane = byXref.get('@I4@')!; // nema FAMC, ali jeste CHIL u @F1@
    expect(jane.father_xref).toBe('@I1@');
    expect(jane.mother_xref).toBe('@I2@');
  });

  it('FAM sa MARR datumom daje marriage union', () => {
    const u = result.unions[0]!;
    expect(u.partner1_xref).toBe('@I1@');
    expect(u.partner2_xref).toBe('@I2@');
    expect(u.type).toBe('marriage');
    expect(u.start_date).toBe('1925-05-05');
  });
});
