import type Database from 'better-sqlite3';

type DB = Database.Database;

/** Migracije ugrađene u kod (bundle-safe — bez .sql fajlova na disku). */
export interface Migration {
  version: number;
  sql: string;
}

export const migrations: Migration[] = [
  {
    version: 1,
    sql: `
CREATE TABLE persons (
  id           INTEGER PRIMARY KEY,
  first_name   TEXT NOT NULL,
  last_name    TEXT NOT NULL DEFAULT '',
  maiden_name  TEXT,
  gender       TEXT NOT NULL DEFAULT 'U' CHECK (gender IN ('M','F','U')),
  title        TEXT,
  birth_date   TEXT,
  death_date   TEXT,
  birth_place  TEXT,
  notes        TEXT,
  photo_id     TEXT,
  father_id    INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  mother_id    INTEGER REFERENCES persons(id) ON DELETE SET NULL,
  gedcom_xref  TEXT,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  CHECK (father_id IS NULL OR father_id <> id),
  CHECK (mother_id IS NULL OR mother_id <> id)
);
CREATE INDEX idx_persons_father ON persons(father_id);
CREATE INDEX idx_persons_mother ON persons(mother_id);

CREATE TABLE unions (
  id           INTEGER PRIMARY KEY,
  partner1_id  INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  partner2_id  INTEGER NOT NULL REFERENCES persons(id) ON DELETE CASCADE,
  type         TEXT NOT NULL DEFAULT 'marriage' CHECK (type IN ('marriage','partnership')),
  start_date   TEXT,
  end_date     TEXT,
  end_reason   TEXT CHECK (end_reason IN ('divorce','death','separation')),
  notes        TEXT,
  CHECK (partner1_id < partner2_id)
);
CREATE INDEX idx_unions_p1 ON unions(partner1_id);
CREATE INDEX idx_unions_p2 ON unions(partner2_id);
`,
  },
  {
    version: 2,
    // Ručno označena glava porodice (silazna loza) — interno svojstvo, van GEDCOM-a.
    sql: `ALTER TABLE persons ADD COLUMN is_family_head INTEGER NOT NULL DEFAULT 0;`,
  },
];

export function runMigrations(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const m of pending) {
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}
