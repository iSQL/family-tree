/**
 * Fixture porodica za razvoj i testiranje kalkulatora srodstva: ~100 osoba kroz
 * 6 generacija, sa tankom lozom dubokih predaka (deda…navrdeda…kurđel), braćom
 * i sestrama (stric/ujak/tetka), supružnicima koji ulaze sa SVOJOM porodicom
 * (roditelji + brat/sestra) — čime se pokrivaju tazbinske veze (svekar, tast,
 * snaha, zet, dever, zaova, šurak, svastika, pašenog, jetrva, šurnjaja, svojak)
 * i prija/prijatelj (roditelji venčane dece). Jedan razvod + ponovni brak daje
 * očuh/maćeha/pastorak. Deterministički je (bez slučajnih brojeva).
 *
 * Pokretanje: npm run seed (cwd = server/). BRIŠE postojeće podatke!
 */
import fs from 'node:fs';
import path from 'node:path';
import { loadConfig, loadEnvFile } from './config';
import { openDb } from './db';

loadEnvFile();
const cfg = loadConfig();
const dataDir = path.resolve(cfg.dataDir);
fs.mkdirSync(dataDir, { recursive: true });
const dbPath = path.join(dataDir, 'familytree.db');
const db = openDb(dbPath);

interface SeedPerson {
  first_name: string;
  last_name?: string;
  maiden_name?: string | null;
  gender?: 'M' | 'F' | 'U';
  title?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_place?: string | null;
  notes?: string | null;
  father_id?: number | null;
  mother_id?: number | null;
}

const insertPerson = db.prepare(
  `INSERT INTO persons (first_name, last_name, maiden_name, gender, title, birth_date, death_date, birth_place, notes, father_id, mother_id)
   VALUES (@first_name, @last_name, @maiden_name, @gender, @title, @birth_date, @death_date, @birth_place, @notes, @father_id, @mother_id)`,
);

function osoba(p: SeedPerson): number {
  const row = {
    last_name: 'Đorđević',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    notes: null,
    father_id: null,
    mother_id: null,
    ...p,
  };
  return Number(insertPerson.run(row).lastInsertRowid);
}

const insertUnion = db.prepare(
  `INSERT INTO unions (partner1_id, partner2_id, type, start_date, end_date, end_reason, notes)
   VALUES (?, ?, ?, ?, ?, ?, ?)`,
);

function brak(
  a: number,
  b: number,
  start: string | number | null,
  end: string | number | null = null,
  endReason: 'divorce' | 'death' | 'separation' | null = null,
): void {
  const [p1, p2] = a < b ? [a, b] : [b, a];
  const s = start === null ? null : String(start);
  const e = end === null ? null : String(end);
  insertUnion.run(p1, p2, 'marriage', s, e, endReason, null);
}

// ─── Generator (deterministički) ───────────────────────────────────────────

const M_NAMES = [
  'Aleksandar', 'Milorad', 'Borivoje', 'Vukašin', 'Dragan', 'Zoran', 'Nikola', 'Miloš', 'Stefan',
  'Marko', 'Luka', 'Filip', 'Đorđe', 'Petar', 'Pavle', 'Uroš', 'Vladimir', 'Nemanja', 'Ognjen',
  'Lazar', 'Strahinja', 'Andrej', 'Mihajlo', 'Vasilije', 'Bogdan', 'Damjan', 'Jovan', 'Đurađ',
  'Ranko', 'Slobodan', 'Branislav', 'Miodrag', 'Radovan', 'Veljko', 'Dušan', 'Goran', 'Predrag',
  'Saša', 'Relja', 'Časlav',
];
const F_NAMES = [
  'Darinka', 'Stanislava', 'Milica', 'Gordana', 'Vesna', 'Jasmina', 'Jelena', 'Tamara', 'Đurđa',
  'Ana', 'Mila', 'Sofija', 'Teodora', 'Katarina', 'Ivana', 'Olga', 'Nada', 'Ljubica', 'Svetlana',
  'Maja', 'Marija', 'Jovana', 'Anđela', 'Tijana', 'Dragana', 'Snežana', 'Vera', 'Zorica', 'Biljana',
  'Mirjana', 'Radmila', 'Leposava', 'Danica', 'Bojana', 'Kristina', 'Milena', 'Sara', 'Nevena',
  'Dunja', 'Iskra',
];
const SURNAMES = [
  'Petrović', 'Jovanović', 'Nikolić', 'Ilić', 'Marković', 'Pavlović', 'Stojanović', 'Lazić',
  'Ristić', 'Tadić', 'Savić', 'Kovačević', 'Popović', 'Ćirić', 'Mitrović', 'Đukić', 'Šarić',
];
const PLACES = ['Niš', 'Beograd', 'Kragujevac', 'Novi Sad', 'Čačak', 'Kraljevo', 'Leskovac', 'Užice'];

let mi = 0;
let fi = 0;
let si = 0;
let salt = 0;
let childCounter = 0;
const nm = (): string => M_NAMES[mi++ % M_NAMES.length]!;
const nf = (): string => F_NAMES[fi++ % F_NAMES.length]!;
const ns = (): string => SURNAMES[si++ % SURNAMES.length]!;

/** Deterministički datum rođenja iz godine i rednog broja. */
function bd(year: number): string {
  salt++;
  const mm = String((salt * 7) % 12 + 1).padStart(2, '0');
  const dd = String((salt * 13) % 27 + 1).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}

type G = 'M' | 'F';
interface Kid {
  id: number;
  gender: G;
}
interface Couple {
  husband: number;
  wife: number;
}

function P(gender: G, year: number, father: number | null = null, mother: number | null = null, opts: Partial<SeedPerson> = {}): number {
  return osoba({
    first_name: gender === 'M' ? nm() : nf(),
    gender,
    father_id: father,
    mother_id: mother,
    birth_date: bd(year),
    birth_place: PLACES[salt % PLACES.length]!,
    ...opts,
  });
}

/** Deca jednog para (otac = husband, majka = wife). */
function children(c: Couple, n: number, startYear: number): Kid[] {
  const out: Kid[] = [];
  for (let i = 0; i < n; i++) {
    const gender: G = childCounter++ % 2 === 0 ? 'M' : 'F';
    out.push({ id: P(gender, startYear + i * 2, c.husband, c.wife), gender });
  }
  return out;
}

function coupleOf(blood: Kid, spouse: number): Couple {
  return blood.gender === 'M' ? { husband: blood.id, wife: spouse } : { husband: spouse, wife: blood.id };
}

/**
 * Ženi/udaje krvnog člana za osobu „spolja". Ako withFamily, supružnik dolazi sa
 * svojim roditeljima i jednim bratom/sestrom (koji je takođe u braku) — to puni
 * tazbinu (svekar/tast, dever/zaova/šurak/svastika, pašenog/jetrva…) i prija.
 */
function inMarry(bloodId: number, bloodGender: G, year: number, withFamily: boolean): number {
  const sg: G = bloodGender === 'M' ? 'F' : 'M';
  const sur = ns();
  let father: number | null = null;
  let mother: number | null = null;
  if (withFamily) {
    father = P('M', year - 30, null, null, { last_name: sur });
    mother = P('F', year - 27, null, null, { last_name: sur, maiden_name: ns() });
    brak(father, mother, year - 31);
    const sibG: G = salt % 2 === 0 ? 'M' : 'F';
    const sib = P(sibG, year + 2, father, mother, sibG === 'F' ? { last_name: sur, maiden_name: sur } : { last_name: sur });
    const sibSpouse = P(sibG === 'M' ? 'F' : 'M', year + 1, null, null, { last_name: sibG === 'M' ? sur : ns() });
    brak(sib, sibSpouse, year + 26);
  }
  const spouse =
    sg === 'F'
      ? P('F', year - 2, father, mother, { last_name: 'Đorđević', maiden_name: sur })
      : P('M', year - 2, father, mother, { last_name: sur });
  brak(bloodId, spouse, year);
  return spouse;
}

db.transaction(() => {
  db.exec('DELETE FROM unions; DELETE FROM persons;');

  // ── Tanka loza dubokih predaka (za pradeda/čukundeda/navrdeda/kurđel) ──
  const kurdel = P('M', 1838, null, null, { last_name: 'Đorđević', death_date: '1901-04-12' });
  const navrdeda = P('M', 1865, kurdel, null, { last_name: 'Đorđević', death_date: '1930-08-03' });

  // ── G1: koren porodice ──
  const g1h = P('M', 1905, navrdeda, null, { last_name: 'Đorđević', title: 'pop', death_date: '1979-02-20' });
  const g1w = P('F', 1910, null, null, { last_name: 'Đorđević', maiden_name: ns(), death_date: '1988-11-30' });
  brak(g1h, g1w, 1928);
  const root: Couple = { husband: g1h, wife: g1w };

  // ── G2: deca korena, svako se ženi/udaje sa svojom porodicom (prija + tazbina) ──
  const g2kids = children(root, 4, 1930);
  const g2couples = g2kids.map((k, i) => coupleOf(k, inMarry(k.id, k.gender, 1955 + i, true)));

  // ── G3 ──
  const g3couples: Couple[] = [];
  const g3bloodMales: number[] = [];
  g2couples.forEach((c, ci) => {
    const kids = children(c, 2 + (ci % 2), 1957 + ci * 2);
    kids.forEach((k, ki) => {
      if (k.gender === 'M') g3bloodMales.push(k.id);
      const spouse = inMarry(k.id, k.gender, 1982 + ci + ki, (ci + ki) % 2 === 0);
      g3couples.push(coupleOf(k, spouse));
    });
  });

  // ── G4 ──
  const g4couples: Couple[] = [];
  g3couples.forEach((c, ci) => {
    const kids = children(c, 1 + (ci % 2), 1985 + ci);
    kids.forEach((k, ki) => {
      if ((ci + ki) % 3 !== 0) {
        g4couples.push(coupleOf(k, inMarry(k.id, k.gender, 2010 + ci + ki, false)));
      }
    });
  });

  // ── G5: najmlađa deca ──
  g4couples.slice(0, 7).forEach((c, ci) => {
    children(c, 1 + (ci % 2), 2012 + ci);
  });

  // ── Razvod + ponovni brak: očuh / maćeha / pastorak ──
  // Jedan krvni muškarac iz G3 imao je raniji (razvedeni) brak; ta žena ima sina
  // iz još ranije veze → on je njegov pastorak, a on je sinu očuh; deca iz
  // sadašnjeg braka tu ženu vide kao maćehu.
  const ocuh = g3bloodMales[0]!;
  const bivsaZena = P('F', 1962, null, null, { last_name: 'Đorđević', maiden_name: ns() });
  brak(ocuh, bivsaZena, 1984, 1990, 'divorce');
  const drugiOtac = P('M', 1958, null, null, { last_name: ns() });
  P('M', 1982, drugiOtac, bivsaZena, { last_name: ns() }); // pastorak (sin bivše žene, nije krvni)
})();

const personCount = (db.prepare('SELECT COUNT(*) AS n FROM persons').get() as { n: number }).n;
const unionCount = (db.prepare('SELECT COUNT(*) AS n FROM unions').get() as { n: number }).n;
console.log(`Seed gotov: ${personCount} osoba i ${unionCount} brakova u ${dbPath}`);
