/**
 * Potpuna rezervna kopija (ZIP: cela baza + sve slike) — samo admin (puna lozinka).
 *   GET  /api/backup/export   → preuzimanje ZIP-a
 *   POST /api/backup/restore  → vraćanje iz ZIP-a (BRIŠE sve postojeće)
 * Obe rute su iza requireFullAccess, pa i izvoz (GET) traži pun pristup.
 */
import { Router } from 'express';
import { Buffer } from 'node:buffer';
import multer from 'multer';
import type { DB } from '../db';
import type { AppConfig } from '../config';
import { requireFullAccess } from '../middleware/auth';
import { AppError } from '../middleware/errors';
import { buildBackupZip, restoreBackupZip } from '../services/fullBackup';

function backupFileName(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `porodicno-stablo-backup-${y}-${m}-${d}.zip`;
}

export function createBackupRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  // Slike mogu biti desetine MB — velikodušan limit; radnja je retka i namerna.
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 250 * 1024 * 1024 } });

  router.use(requireFullAccess(cfg));

  router.get('/export', (_req, res) => {
    const zip = buildBackupZip(db, cfg.dataDir);
    res.set('Content-Type', 'application/zip');
    res.set('Content-Disposition', `attachment; filename="${backupFileName()}"`);
    res.send(Buffer.from(zip));
  });

  router.post('/restore', upload.single('file'), (req, res) => {
    if (!req.file) throw new AppError(400, 'validation', 'Nedostaje fajl u polju "file"');
    res.json(restoreBackupZip(db, cfg.dataDir, req.file.buffer));
  });

  return router;
}
