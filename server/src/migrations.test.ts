import { describe, expect, it } from 'vitest';
import Database from 'better-sqlite3';
import { migrations, runMigrations } from './migrations';
import { openDb } from './db';

/** Baza zaustavljena na zadatoj verziji (kao produkcija koja je primenila samo starije migracije). */
function dbAtVersion(version: number): Database.Database {
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  for (const m of migrations.filter((x) => x.version <= version)) {
    if (m.sql) db.exec(m.sql);
    m.up?.(db);
    db.pragma(`user_version = ${m.version}`);
  }
  return db;
}

const tables = (db: Database.Database) =>
  (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all() as { name: string }[]).map(
    (t) => t.name,
  );

describe('migracija 4 — predlozi prelaze na grane', () => {
  it('produkcijska šema iz verzije 3: linkovi ostaju, stari predlozi nestaju, grane rade', () => {
    const db = dbAtVersion(3);
    db.exec(`
      INSERT INTO proposal_tokens (id, token, label, created_at, expires_at)
        VALUES (1, 'stari', 'Bez roka', '2026-09-10 08:30:00', NULL),
               (2, 'novi', 'Sa rokom', '2026-09-10T08:30:00.000Z', '2026-10-10T08:30:00.000Z');
      INSERT INTO proposals (token_id, author_name, data) VALUES (1, 'Ana', '{}');
    `);

    runMigrations(db);

    expect(db.pragma('user_version', { simple: true })).toBe(migrations.at(-1)!.version);
    expect(tables(db)).toContain('proposal_ops');
    expect(tables(db)).not.toContain('proposals');
    expect(db.prepare('SELECT id, created_at, expires_at, next_local_id FROM proposal_tokens ORDER BY id').all()).toEqual([
      { id: 1, created_at: '2026-09-10T08:30:00.000Z', expires_at: '2026-09-10T08:30:00.000Z', next_local_id: 1 },
      { id: 2, created_at: '2026-09-10T08:30:00.000Z', expires_at: '2026-10-10T08:30:00.000Z', next_local_id: 1 },
    ]);

    db.prepare(
      `INSERT INTO proposal_ops (token_id, entity, entity_id, action, payload, author, created_at)
       VALUES (2, 'person', 1000000001, 'create', '{}', 'Ana', '2026-09-11T00:00:00.000Z')`,
    ).run();
    db.prepare('DELETE FROM proposal_tokens WHERE id = 2').run();
    expect(db.prepare('SELECT COUNT(*) AS n FROM proposal_ops').get()).toEqual({ n: 0 }); // FK kaskada
  });

  it('dev baza koja je već imala šemu grana u verziji 3 ostaje netaknuta', () => {
    const db = dbAtVersion(2);
    db.exec(`
      CREATE TABLE proposal_tokens (
        id INTEGER PRIMARY KEY, token TEXT NOT NULL UNIQUE, label TEXT NOT NULL, created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL, revoked INTEGER NOT NULL DEFAULT 0, next_local_id INTEGER NOT NULL DEFAULT 1,
        submitted_at TEXT, submitted_by TEXT, submit_note TEXT
      );
      CREATE TABLE proposal_ops (
        id INTEGER PRIMARY KEY, token_id INTEGER NOT NULL REFERENCES proposal_tokens(id) ON DELETE CASCADE,
        entity TEXT NOT NULL, entity_id INTEGER NOT NULL, action TEXT NOT NULL, payload TEXT NOT NULL,
        author TEXT NOT NULL, created_at TEXT NOT NULL
      );
      INSERT INTO proposal_tokens (id, token, label, created_at, expires_at, next_local_id, submitted_by)
        VALUES (1, 'tok', 'Rođaci', '2026-09-10T08:30:00.000Z', '2026-10-10T08:30:00.000Z', 4, 'Ana');
      INSERT INTO proposal_ops (token_id, entity, entity_id, action, payload, author, created_at)
        VALUES (1, 'person', 1000000003, 'create', '{}', 'Ana', '2026-09-10T09:00:00.000Z');
    `);
    db.pragma('user_version = 3');

    runMigrations(db);

    expect(db.prepare('SELECT next_local_id, submitted_by FROM proposal_tokens').get()).toEqual({
      next_local_id: 4,
      submitted_by: 'Ana',
    });
    expect(db.prepare('SELECT COUNT(*) AS n FROM proposal_ops').get()).toEqual({ n: 1 });
  });

  it('nova baza dobija poslednju verziju šeme', () => {
    const db = openDb(':memory:');
    expect(db.pragma('user_version', { simple: true })).toBe(migrations.at(-1)!.version);
    expect(tables(db)).toEqual(expect.arrayContaining(['persons', 'unions', 'proposal_tokens', 'proposal_ops']));
    expect(tables(db)).not.toContain('proposals');
  });
});
