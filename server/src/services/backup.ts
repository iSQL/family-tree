import fs from 'node:fs';
import path from 'node:path';
import type { DB } from '../db';

const KEEP = 14;
const BACKUP_RE = /^familytree-\d{4}-\d{2}-\d{2}\.db$/;

export function todaysBackupName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `familytree-${y}-${m}-${d}.db`;
}

function prune(backupsDir: string): void {
  const files = fs
    .readdirSync(backupsDir)
    .filter((f) => BACKUP_RE.test(f))
    .sort()
    .reverse();
  for (const f of files.slice(KEEP)) {
    fs.rmSync(path.join(backupsDir, f), { force: true });
  }
}

/** Pravi današnji bekap ako ne postoji; zadržava poslednjih 14. */
export async function backupIfNeeded(db: DB, backupsDir: string, log?: (msg: string) => void): Promise<boolean> {
  fs.mkdirSync(backupsDir, { recursive: true });
  const target = path.join(backupsDir, todaysBackupName());
  if (fs.existsSync(target)) return false;
  await db.backup(target);
  prune(backupsDir);
  log?.(`Napravljen bekap baze: ${target}`);
  return true;
}

/** Pokreće bekap odmah (ako danas nema) pa proverava na sat — preživljava ponoć. */
export function startBackupTimer(db: DB, backupsDir: string, log?: (msg: string) => void): NodeJS.Timeout {
  const run = () => {
    backupIfNeeded(db, backupsDir, log).catch((err) => {
      log?.(`Bekap nije uspeo: ${err instanceof Error ? err.message : String(err)}`);
    });
  };
  run();
  const timer = setInterval(run, 60 * 60 * 1000);
  timer.unref();
  return timer;
}
