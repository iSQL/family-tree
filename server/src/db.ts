import Database from 'better-sqlite3';
import { runMigrations } from './migrations';

/** Instanca konekcije — @types/better-sqlite3 drži tip u namespace-u. */
export type DB = Database.Database;

export function openDb(fileOrMemory: string): DB {
  const db = new Database(fileOrMemory);
  if (fileOrMemory !== ':memory:') {
    db.pragma('journal_mode = WAL');
  }
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  runMigrations(db);
  return db;
}
