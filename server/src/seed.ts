/**
 * Fixture porodica za razvoj: tri generacije, ponovni brak i polubrat.
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
  start: string | null,
  end: string | null = null,
  endReason: 'divorce' | 'death' | 'separation' | null = null,
): void {
  const [p1, p2] = a < b ? [a, b] : [b, a];
  insertUnion.run(p1, p2, 'marriage', start, end, endReason, null);
}

db.transaction(() => {
  db.exec('DELETE FROM unions; DELETE FROM persons;');

  // 1. generacija
  const milorad = osoba({
    first_name: 'Milorad', gender: 'M', birth_date: '1932-05-14', death_date: '2005-03-17', birth_place: 'Niš',
  });
  const stanislava = osoba({
    first_name: 'Stanislava', maiden_name: 'Šarić', gender: 'F', birth_date: '1936-11-02', birth_place: 'Niš',
  });
  const vukasin = osoba({
    first_name: 'Vukašin', last_name: 'Ćirić', gender: 'M', birth_date: '1938-02-23', birth_place: 'Kragujevac',
  });
  const milica = osoba({
    first_name: 'Milica', last_name: 'Ćirić', maiden_name: 'Đukić', gender: 'F', birth_date: '1942', // parcijalan datum
  });

  // 2. generacija
  const dragan = osoba({
    first_name: 'Dragan', gender: 'M', title: 'prof. dr', birth_date: '1958-07-09', birth_place: 'Niš',
    father_id: milorad, mother_id: stanislava,
  });
  const zoran = osoba({
    first_name: 'Zoran', gender: 'M', birth_date: '1961-09-30', birth_place: 'Niš',
    father_id: milorad, mother_id: stanislava,
  });
  const gordana = osoba({
    first_name: 'Gordana', maiden_name: 'Ćirić', gender: 'F', title: 'dr', birth_date: '1963-04-18', birth_place: 'Kragujevac',
    father_id: vukasin, mother_id: milica,
  });
  const vesna = osoba({
    first_name: 'Vesna', last_name: 'Petrović', gender: 'F', birth_date: '1959-12-01', birth_place: 'Beograd',
  });
  const jasmina = osoba({
    first_name: 'Jasmina', maiden_name: 'Šarac', gender: 'F', birth_date: '1964-06-25',
  });

  // 3. generacija — Nikola je polubrat (po ocu) Miloševoj grani iz Draganovog prvog braka
  const nikola = osoba({
    first_name: 'Nikola', gender: 'M', birth_date: '1982-01-20', birth_place: 'Beograd',
    father_id: dragan, mother_id: vesna,
  });
  const milos = osoba({
    first_name: 'Miloš', gender: 'M', birth_date: '1986-10-05', birth_place: 'Niš',
    father_id: dragan, mother_id: gordana,
  });
  const jelena = osoba({
    first_name: 'Jelena', gender: 'F', birth_date: '1989-03-12', birth_place: 'Niš',
    father_id: dragan, mother_id: gordana,
  });
  const djurdja = osoba({
    first_name: 'Đurđa', gender: 'F', birth_date: '1993-08-27', birth_place: 'Niš',
    father_id: dragan, mother_id: gordana,
  });
  const stefan = osoba({
    first_name: 'Stefan', gender: 'M', birth_date: '1990-02-14', birth_place: 'Niš',
    father_id: zoran, mother_id: jasmina,
  });
  const tamara = osoba({
    first_name: 'Tamara', gender: 'F', birth_date: '1992-11-08', birth_place: 'Niš',
    father_id: zoran, mother_id: jasmina,
  });
  void nikola; void milos; void jelena; void djurdja; void stefan; void tamara;

  brak(milorad, stanislava, '1955-09-04');
  brak(vukasin, milica, '1961-05-21');
  brak(dragan, vesna, '1980-06-14', '1984-02-10', 'divorce'); // prvi brak → razvod
  brak(dragan, gordana, '1985-10-19'); // ponovni brak
  brak(zoran, jasmina, '1988-04-30');
})();

const personCount = (db.prepare('SELECT COUNT(*) AS n FROM persons').get() as { n: number }).n;
const unionCount = (db.prepare('SELECT COUNT(*) AS n FROM unions').get() as { n: number }).n;
console.log(`Seed gotov: ${personCount} osoba i ${unionCount} brakova u ${dbPath}`);
