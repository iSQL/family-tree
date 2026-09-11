import type Database from 'better-sqlite3';

type DB = Database.Database;

/** Migracije ugrađene u kod (bundle-safe — bez .sql fajlova na disku). */
export interface Migration {
  version: number;
  sql?: string;
  /** Kad izmena mora da zavisi od zatečene šeme (npr. baze koje su prošle različite verzije). */
  up?: (db: DB) => void;
}

const PROPOSAL_TOKENS_V4 = `
CREATE TABLE proposal_tokens_v4 (
  id            INTEGER PRIMARY KEY,
  token         TEXT NOT NULL UNIQUE,
  label         TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  expires_at    TEXT NOT NULL,
  revoked       INTEGER NOT NULL DEFAULT 0,
  next_local_id INTEGER NOT NULL DEFAULT 1,
  submitted_at  TEXT,
  submitted_by  TEXT,
  submit_note   TEXT
);`;

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
  {
    version: 3,
    // Podrška za tokene pozivnica i predloge novih osoba/brakova (Git PR model).
    sql: `
CREATE TABLE proposal_tokens (
  id           INTEGER PRIMARY KEY,
  token        TEXT NOT NULL UNIQUE,
  label        TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at   TEXT,
  revoked      INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX idx_proposal_tokens_token ON proposal_tokens(token);

CREATE TABLE proposals (
  id           INTEGER PRIMARY KEY,
  token_id     INTEGER REFERENCES proposal_tokens(id) ON DELETE SET NULL,
  author_name  TEXT NOT NULL,
  notes        TEXT,
  status       TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','approved','rejected')),
  data         TEXT NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at  TEXT,
  review_notes TEXT
);
CREATE INDEX idx_proposals_status ON proposals(status);
CREATE INDEX idx_proposals_token ON proposals(token_id);
`,
  },
  {
    version: 4,
    // Predlozi rođaka prelaze na model grana: pozivni link = grana, svaka izmena iz režima
    // predloga je operacija u proposal_ops. Verzija 3 je jedno vreme u razvoju imala drugačiji
    // SQL (već sa ovom šemom), pa se proverava zatečena šema umesto pretpostavke.
    up: (db) => {
      const tokenColumns = new Set(
        (db.pragma('table_info(proposal_tokens)') as { name: string }[]).map((c) => c.name),
      );
      if (!tokenColumns.has('next_local_id')) {
        // Stari linkovi ostaju (bez roka → ističu odmah); stari predlozi nisu prenosivi u grane.
        db.exec(`
DROP TABLE IF EXISTS proposals;
${PROPOSAL_TOKENS_V4}
INSERT INTO proposal_tokens_v4 (id, token, label, created_at, expires_at, revoked)
  SELECT id, token, label, created_at, COALESCE(expires_at, created_at), revoked FROM proposal_tokens;
UPDATE proposal_tokens_v4
  SET created_at = replace(created_at, ' ', 'T') || '.000Z'
  WHERE created_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';
UPDATE proposal_tokens_v4
  SET expires_at = replace(expires_at, ' ', 'T') || '.000Z'
  WHERE expires_at GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9] [0-9][0-9]:[0-9][0-9]:[0-9][0-9]';
DROP TABLE proposal_tokens;
ALTER TABLE proposal_tokens_v4 RENAME TO proposal_tokens;
`);
      }
      db.exec(`
DROP TABLE IF EXISTS proposals;
CREATE TABLE IF NOT EXISTS proposal_ops (
  id          INTEGER PRIMARY KEY,
  token_id    INTEGER NOT NULL REFERENCES proposal_tokens(id) ON DELETE CASCADE,
  entity      TEXT NOT NULL CHECK (entity IN ('person','union')),
  entity_id   INTEGER NOT NULL,
  action      TEXT NOT NULL CHECK (action IN ('create','update','delete')),
  payload     TEXT NOT NULL,
  author      TEXT NOT NULL,
  created_at  TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_proposal_ops_token ON proposal_ops(token_id, id);
`);
    },
  },
  {
    version: 5,
    // Opoziv linka odsad trajno briše link sa granom — ukloni i ranije opozvane.
    sql: `
DELETE FROM proposal_ops WHERE token_id IN (SELECT id FROM proposal_tokens WHERE revoked = 1);
DELETE FROM proposal_tokens WHERE revoked = 1;
`,
  },
];

export function runMigrations(db: DB): void {
  const current = db.pragma('user_version', { simple: true }) as number;
  const pending = migrations
    .filter((m) => m.version > current)
    .sort((a, b) => a.version - b.version);

  for (const m of pending) {
    db.transaction(() => {
      if (m.sql) db.exec(m.sql);
      m.up?.(db);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}
