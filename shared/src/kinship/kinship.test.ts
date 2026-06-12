import { describe, expect, it } from 'vitest';
import type { Gender, PersonSlim, TreeResponse, Union } from '../types';
import { describeKinship } from './index';

// ─── Fixture porodica (4+ generacije, obe linije, razvod + ponovni brak, polusiblings) ───
//
// Očinska linija:  Živojin+Stanija → Milutin(+Ruža) → Jovan(+Milica) → {Dragan, Petar, Gordana}
// Majčinska linija: Stevan+Zorka → {Vesna, Branko(+Olga), Sofija(+Miloš)}
// Dragan: bivši brak sa Ljubicom (→ Nenad), sadašnji sa Vesnom (→ Marko, Jelena, Saša[U])
// Petar: bivši brak sa Svetlanom, sadašnji sa Nadom (→ Ivan, Maja)
// Vesna pre Dragana ima sina Milana (polubrat po majci)
// Marko+Ana → Luka(+Teodora), Mila(+Filip)
// Ana (Radovan+Dušanka) ima brata Nikolu i sestru Ivanu (+Vladimir)
// Nenad+Katarina; Jelena+Stefan; Saša → Vanja[U]; Žarko = nepovezan

const ZIVOJIN = 1;
const STANIJA = 2;
const MILUTIN = 3;
const RUZA = 4;
const JOVAN = 5;
const MILICA = 6;
const DRAGAN = 7;
const PETAR = 8;
const GORDANA = 9;
const VESNA = 10;
const STEVAN = 11;
const ZORKA = 12;
const BRANKO = 13;
const OLGA = 14;
const SOFIJA = 15;
const MILOS = 16;
const NADA = 17;
const SVETLANA = 18;
const LJUBICA = 19;
const MARKO = 20;
const JELENA = 21;
const NENAD = 22;
const IVAN = 23;
const MAJA = 24;
const GORAN = 25;
const TIJANA = 26;
const ANA = 27;
const RADOVAN = 28;
const DUSANKA = 29;
const NIKOLA = 30;
const IVANA = 31;
const VLADIMIR = 32;
const KATARINA = 33;
const LUKA = 34;
const MILA = 35;
const STEFAN = 36;
const FILIP = 37;
const TEODORA = 38;
const SASA = 39;
const VANJA = 40;
const ZARKO = 41;
const MILAN = 42;

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
    father_id,
    mother_id,
  };
}

let nextUnionId = 1;
function union(a: number, b: number, opts: Partial<Union> = {}): Union {
  const [p1, p2] = a < b ? [a, b] : [b, a];
  return {
    id: nextUnionId++,
    partner1_id: p1,
    partner2_id: p2,
    type: 'marriage',
    start_date: null,
    end_date: null,
    end_reason: null,
    notes: null,
    ...opts,
  };
}

const tree: TreeResponse = {
  persons: [
    person(ZIVOJIN, 'Živojin', 'M'),
    person(STANIJA, 'Stanija', 'F'),
    person(MILUTIN, 'Milutin', 'M', ZIVOJIN, STANIJA),
    person(RUZA, 'Ruža', 'F'),
    person(JOVAN, 'Jovan', 'M', MILUTIN, RUZA),
    person(MILICA, 'Milica', 'F'),
    person(DRAGAN, 'Dragan', 'M', JOVAN, MILICA),
    person(PETAR, 'Petar', 'M', JOVAN, MILICA),
    person(GORDANA, 'Gordana', 'F', JOVAN, MILICA),
    person(VESNA, 'Vesna', 'F', STEVAN, ZORKA),
    person(STEVAN, 'Stevan', 'M'),
    person(ZORKA, 'Zorka', 'F'),
    person(BRANKO, 'Branko', 'M', STEVAN, ZORKA),
    person(OLGA, 'Olga', 'F'),
    person(SOFIJA, 'Sofija', 'F', STEVAN, ZORKA),
    person(MILOS, 'Miloš', 'M'),
    person(NADA, 'Nada', 'F'),
    person(SVETLANA, 'Svetlana', 'F'),
    person(LJUBICA, 'Ljubica', 'F'),
    person(MARKO, 'Marko', 'M', DRAGAN, VESNA),
    person(JELENA, 'Jelena', 'F', DRAGAN, VESNA),
    person(NENAD, 'Nenad', 'M', DRAGAN, LJUBICA),
    person(IVAN, 'Ivan', 'M', PETAR, NADA),
    person(MAJA, 'Maja', 'F', PETAR, NADA),
    person(GORAN, 'Goran', 'M', BRANKO, OLGA),
    person(TIJANA, 'Tijana', 'F', MILOS, SOFIJA),
    person(ANA, 'Ana', 'F', RADOVAN, DUSANKA),
    person(RADOVAN, 'Radovan', 'M'),
    person(DUSANKA, 'Dušanka', 'F'),
    person(NIKOLA, 'Nikola', 'M', RADOVAN, DUSANKA),
    person(IVANA, 'Ivana', 'F', RADOVAN, DUSANKA),
    person(VLADIMIR, 'Vladimir', 'M'),
    person(KATARINA, 'Katarina', 'F'),
    person(LUKA, 'Luka', 'M', MARKO, ANA),
    person(MILA, 'Mila', 'F', MARKO, ANA),
    person(STEFAN, 'Stefan', 'M'),
    person(FILIP, 'Filip', 'M'),
    person(TEODORA, 'Teodora', 'F'),
    person(SASA, 'Saša', 'U', DRAGAN, VESNA),
    person(VANJA, 'Vanja', 'U', SASA, null),
    person(ZARKO, 'Žarko', 'M'),
    person(MILAN, 'Milan', 'M', null, VESNA),
  ],
  unions: [
    union(ZIVOJIN, STANIJA),
    union(MILUTIN, RUZA),
    union(JOVAN, MILICA),
    union(STEVAN, ZORKA),
    union(DRAGAN, VESNA),
    union(DRAGAN, LJUBICA, { end_date: '1985', end_reason: 'divorce' }),
    union(PETAR, NADA),
    union(PETAR, SVETLANA, { end_date: '1990', end_reason: 'divorce' }),
    union(BRANKO, OLGA),
    union(SOFIJA, MILOS),
    union(MARKO, ANA),
    union(NENAD, KATARINA),
    union(JELENA, STEFAN),
    union(MILA, FILIP),
    union(LUKA, TEODORA),
    union(IVANA, VLADIMIR),
  ],
};

interface Case {
  name: string;
  from: number;
  to: number;
  term: string | null;
  degree: number | null;
  descIncludes?: string[];
  descExcludes?: string[];
}

const CASES: Case[] = [
  // direktna linija
  { name: 'otac', from: MARKO, to: DRAGAN, term: 'otac', degree: 1 },
  { name: 'majka', from: MARKO, to: VESNA, term: 'majka', degree: 1 },
  { name: 'sin', from: DRAGAN, to: MARKO, term: 'sin', degree: 1 },
  { name: 'ćerka', from: DRAGAN, to: JELENA, term: 'ćerka', degree: 1 },
  { name: 'deda po ocu', from: MARKO, to: JOVAN, term: 'deda', degree: 2, descIncludes: ['(po ocu)'] },
  { name: 'deda po majci', from: MARKO, to: STEVAN, term: 'deda', degree: 2, descIncludes: ['(po majci)'] },
  { name: 'baba po ocu', from: MARKO, to: MILICA, term: 'baba', degree: 2, descIncludes: ['(po ocu)'] },
  { name: 'baba po majci', from: MARKO, to: ZORKA, term: 'baba', degree: 2, descIncludes: ['(po majci)'] },
  { name: 'unuk', from: DRAGAN, to: LUKA, term: 'unuk', degree: 2 },
  { name: 'unuka', from: DRAGAN, to: MILA, term: 'unuka', degree: 2 },
  { name: 'pradeda', from: MARKO, to: MILUTIN, term: 'pradeda', degree: 3 },
  { name: 'prababa', from: MARKO, to: RUZA, term: 'prababa', degree: 3 },
  { name: 'praunuk', from: JOVAN, to: LUKA, term: 'praunuk', degree: 3 },
  { name: 'praunuka', from: JOVAN, to: MILA, term: 'praunuka', degree: 3 },
  { name: 'čukundeda', from: MARKO, to: ZIVOJIN, term: 'čukundeda', degree: 4 },
  { name: 'čukunbaba', from: MARKO, to: STANIJA, term: 'čukunbaba', degree: 4 },

  // braća i sestre (puni i polu)
  { name: 'brat (degree 2)', from: JELENA, to: MARKO, term: 'brat', degree: 2 },
  { name: 'sestra', from: MARKO, to: JELENA, term: 'sestra', degree: 2 },
  { name: 'polubrat po ocu', from: MARKO, to: NENAD, term: 'polubrat', degree: 2, descIncludes: ['(po ocu)'] },
  { name: 'polusestra po ocu', from: NENAD, to: JELENA, term: 'polusestra', degree: 2, descIncludes: ['(po ocu)'] },
  { name: 'polubrat po majci', from: MARKO, to: MILAN, term: 'polubrat', degree: 2, descIncludes: ['(po majci)'] },

  // stričevi, ujaci, tetke + njihovi supružnici
  { name: 'stric (degree 3)', from: MARKO, to: PETAR, term: 'stric', degree: 3, descIncludes: ['(očev brat)'] },
  { name: 'ujak', from: MARKO, to: BRANKO, term: 'ujak', degree: 3, descIncludes: ['(majčin brat)'] },
  { name: 'tetka (očeva sestra)', from: MARKO, to: GORDANA, term: 'tetka', degree: 3, descIncludes: ['(očeva sestra)'] },
  { name: 'tetka (majčina sestra)', from: MARKO, to: SOFIJA, term: 'tetka', degree: 3, descIncludes: ['(majčina sestra)'] },
  { name: 'strina', from: MARKO, to: NADA, term: 'strina', degree: null, descIncludes: ['(stričeva žena)'] },
  { name: 'ujna', from: MARKO, to: OLGA, term: 'ujna', degree: null, descIncludes: ['(ujakova žena)'] },
  { name: 'teča', from: MARKO, to: MILOS, term: 'teča', degree: null, descIncludes: ['(tetkin muž)'] },

  // bratanci i sestrići (obrnut smer od strica/ujaka)
  {
    name: 'bratanac (A muško → sinovac u opisu)',
    from: PETAR,
    to: MARKO,
    term: 'bratanac',
    degree: 3,
    descIncludes: ['(bratov sin', 'sinovac'],
  },
  {
    name: 'bratanac (A žensko → bez sinovca)',
    from: GORDANA,
    to: MARKO,
    term: 'bratanac',
    degree: 3,
    descIncludes: ['(bratov sin)'],
    descExcludes: ['sinovac'],
  },
  { name: 'bratanica', from: PETAR, to: JELENA, term: 'bratanica', degree: 3, descIncludes: ['(bratova ćerka)'] },
  { name: 'sestrić', from: BRANKO, to: MARKO, term: 'sestrić', degree: 3, descIncludes: ['(sestrin sin)'] },
  { name: 'sestričina', from: BRANKO, to: JELENA, term: 'sestričina', degree: 3, descIncludes: ['(sestrina ćerka)'] },

  // braća/sestre od strica/ujaka/tetke
  { name: 'brat od strica (degree 4)', from: MARKO, to: IVAN, term: 'brat od strica', degree: 4 },
  { name: 'sestra od strica', from: MARKO, to: MAJA, term: 'sestra od strica', degree: 4 },
  { name: 'brat od ujaka', from: MARKO, to: GORAN, term: 'brat od ujaka', degree: 4 },
  { name: 'sestra od tetke', from: MARKO, to: TIJANA, term: 'sestra od tetke', degree: 4 },

  // supružnici
  { name: 'muž', from: ANA, to: MARKO, term: 'muž', degree: null },
  { name: 'žena', from: MARKO, to: ANA, term: 'žena', degree: null },

  // tazbina — roditelji supružnika i supružnici dece
  { name: 'svekar', from: ANA, to: DRAGAN, term: 'svekar', degree: null, descIncludes: ['(muževljev otac)'] },
  { name: 'svekrva', from: ANA, to: VESNA, term: 'svekrva', degree: null, descIncludes: ['(muževljeva majka)'] },
  { name: 'tast', from: MARKO, to: RADOVAN, term: 'tast', degree: null, descIncludes: ['(ženin otac)'] },
  { name: 'tašta', from: MARKO, to: DUSANKA, term: 'tašta', degree: null, descIncludes: ['(ženina majka)'] },
  { name: 'zet (ćerkin muž)', from: MARKO, to: FILIP, term: 'zet', degree: null, descIncludes: ['(ćerkin muž)'] },
  { name: 'zet (sestrin muž)', from: MARKO, to: STEFAN, term: 'zet', degree: null, descIncludes: ['(sestrin muž)'] },
  { name: 'snaha (sinovljeva žena)', from: MARKO, to: TEODORA, term: 'snaha', degree: null, descIncludes: ['(sinovljeva žena)'] },
  { name: 'snaha (bratova žena)', from: MARKO, to: KATARINA, term: 'snaha', degree: null, descIncludes: ['(bratova žena)'] },
  { name: 'tast ← zet (obrnut smer)', from: FILIP, to: MARKO, term: 'tast', degree: null, descIncludes: ['(ženin otac)'] },
  { name: 'svekar ← snaha (obrnut smer)', from: TEODORA, to: MARKO, term: 'svekar', degree: null, descIncludes: ['(muževljev otac)'] },
  { name: 'svekrva ← snaha (obrnut smer)', from: TEODORA, to: ANA, term: 'svekrva', degree: null },

  // tazbina — braća/sestre supružnika i njihovi supružnici
  { name: 'dever', from: ANA, to: NENAD, term: 'dever', degree: null, descIncludes: ['(muževljev brat)'] },
  { name: 'zaova', from: ANA, to: JELENA, term: 'zaova', degree: null, descIncludes: ['(muževljeva sestra)'] },
  { name: 'šurak', from: MARKO, to: NIKOLA, term: 'šurak', degree: null, descIncludes: ['(ženin brat)'] },
  { name: 'svastika', from: MARKO, to: IVANA, term: 'svastika', degree: null, descIncludes: ['(ženina sestra)'] },
  { name: 'pašenog', from: MARKO, to: VLADIMIR, term: 'pašenog', degree: null, descIncludes: ['(muž ženine sestre)'] },
  { name: 'jetrva', from: ANA, to: KATARINA, term: 'jetrva', degree: null, descIncludes: ['(žena muževljevog brata)'] },

  // pol U → neutralni fallback termini
  { name: 'pol U: dete', from: DRAGAN, to: SASA, term: 'dete', degree: 1 },
  { name: 'pol U: brat/sestra', from: MARKO, to: SASA, term: 'brat/sestra', degree: 2 },
  { name: 'pol U: roditelj', from: VANJA, to: SASA, term: 'roditelj', degree: 1 },

  // bivši brakovi → '(bivši)' u opisu
  { name: 'bivši muž', from: LJUBICA, to: DRAGAN, term: 'muž', degree: null, descIncludes: ['(bivši)'] },
  {
    name: 'strina iz bivšeg braka',
    from: MARKO,
    to: SVETLANA,
    term: 'strina',
    degree: null,
    descIncludes: ['(stričeva žena)', '(bivši)'],
  },

  // nepokrivene putanje → related, term null, kompozicioni opis
  {
    name: 'fallback: čukununuk → rođak u 4. kolenu',
    from: MILUTIN,
    to: LUKA,
    term: null,
    degree: 4,
    descIncludes: ['rođak u 4. kolenu'],
  },
  {
    name: 'fallback: dete deteta (pol U) → rođak/rođaka u 3. kolenu',
    from: MARKO,
    to: VANJA,
    term: null,
    degree: 3,
    descIncludes: ['rođak/rođaka u 3. kolenu'],
  },
];

describe('describeKinship — tabela slučajeva', () => {
  for (const c of CASES) {
    it(c.name, () => {
      const r = describeKinship(tree, c.from, c.to);
      expect(r.related).toBe(true);
      expect(r.term).toBe(c.term);
      expect(r.degree).toBe(c.degree);
      for (const s of c.descIncludes ?? []) expect(r.description).toContain(s);
      for (const s of c.descExcludes ?? []) expect(r.description).not.toContain(s);
      expect(r.path.length).toBeGreaterThanOrEqual(2);
      expect(r.path[0]).toBe(c.from);
      expect(r.path[r.path.length - 1]).toBe(c.to);
    });
  }
});

describe('describeKinship — oblik rezultata', () => {
  it('gradi rečenicu sa prisvojnim pridevom iz imena', () => {
    expect(describeKinship(tree, MARKO, PETAR).description).toBe('Petar je Markov stric (očev brat).');
    expect(describeKinship(tree, ANA, MARKO).description).toBe('Marko je Anin muž.');
    expect(describeKinship(tree, MARKO, GORDANA).description).toBe('Gordana je Markova tetka (očeva sestra).');
  });

  it('putanja sadrži međukorake (stric: A → otac → deda → stric)', () => {
    expect(describeKinship(tree, MARKO, PETAR).path).toEqual([MARKO, DRAGAN, JOVAN, PETAR]);
  });

  it('nepovezane osobe → related:false, prazna putanja', () => {
    const r = describeKinship(tree, MARKO, ZARKO);
    expect(r).toEqual({
      related: false,
      term: null,
      description: 'Nisu u krvnom srodstvu.',
      path: [],
      degree: null,
    });
  });

  it('nepostojeća osoba → related:false', () => {
    expect(describeKinship(tree, MARKO, 9999).related).toBe(false);
  });

  it('ista osoba → related:true bez termina', () => {
    const r = describeKinship(tree, MARKO, MARKO);
    expect(r.related).toBe(true);
    expect(r.path).toEqual([MARKO]);
  });
});
