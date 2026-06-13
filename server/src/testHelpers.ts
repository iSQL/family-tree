/** Pomoćnici za supertest testove — nije test fajl (vitest hvata samo *.test.ts). */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import type { DB } from './db';
import type { Express } from 'express';
import type { Gender } from '@shared/types';
import type { AppConfig } from './config';
import { openDb } from './db';
import { createApp } from './app';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    nodeEnv: 'test',
    port: 0,
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'ft-test-')),
    authDisabled: true,
    authPassword: 'tajna-lozinka',
    readonlyPassword: '',
    sessionSecret: 'test-secret-'.padEnd(32, 'x'),
    clientDist: '../client/dist',
    ...overrides,
  };
}

export interface TestApp {
  app: Express;
  db: DB;
  cfg: AppConfig;
}

export function testApp(overrides: Partial<AppConfig> = {}): TestApp {
  const cfg = testConfig(overrides);
  const db = openDb(':memory:');
  return { app: createApp(cfg, db), db, cfg };
}

export interface InsertPersonFields {
  first_name: string;
  last_name?: string;
  maiden_name?: string | null;
  gender?: Gender;
  title?: string | null;
  birth_date?: string | null;
  death_date?: string | null;
  birth_place?: string | null;
  notes?: string | null;
  father_id?: number | null;
  mother_id?: number | null;
  gedcom_xref?: string | null;
}

/** Direktan insert u bazu za brze fixture (zaobilazi API). */
export function insertPerson(db: DB, fields: InsertPersonFields): number {
  const row = {
    last_name: '',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    notes: null,
    father_id: null,
    mother_id: null,
    gedcom_xref: null,
    ...fields,
  };
  const info = db
    .prepare(
      `INSERT INTO persons (first_name, last_name, maiden_name, gender, title, birth_date, death_date, birth_place, notes, father_id, mother_id, gedcom_xref)
       VALUES (@first_name, @last_name, @maiden_name, @gender, @title, @birth_date, @death_date, @birth_place, @notes, @father_id, @mother_id, @gedcom_xref)`,
    )
    .run(row);
  return Number(info.lastInsertRowid);
}
