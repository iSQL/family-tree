import { Router } from 'express';
import fs from 'node:fs';
import multer from 'multer';
import type { DB } from '../db';
import type { AppConfig } from '../config';
import { AppError, parseId } from '../middleware/errors';
import { PHOTO_ID_RE, deletePhoto, photoFilePath, savePhoto } from '../services/photoService';

export function createPhotosRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  router.post('/persons/:id/photo', upload.single('photo'), async (req, res) => {
    const id = parseId(req.params.id);
    if (!req.file) throw new AppError(400, 'validation', 'Nedostaje fajl u polju "photo"');
    const photo_id = await savePhoto(db, cfg.dataDir, id, req.file.buffer);
    res.json({ photo_id });
  });

  router.delete('/persons/:id/photo', (req, res) => {
    deletePhoto(db, cfg.dataDir, parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/photos/:uuid', (req, res) => {
    const uuid = req.params.uuid;
    if (!PHOTO_ID_RE.test(uuid)) throw new AppError(400, 'validation', 'Neispravan identifikator slike');
    const size = req.query.size === undefined || req.query.size === 'full' ? 'full' : req.query.size === 'thumb' ? 'thumb' : null;
    if (size === null) throw new AppError(400, 'validation', "Parametar size mora biti 'full' ili 'thumb'");

    const file = photoFilePath(cfg.dataDir, uuid.toLowerCase(), size);
    if (!fs.existsSync(file)) throw new AppError(404, 'not_found');
    res.sendFile(file, {
      cacheControl: false,
      headers: { 'Cache-Control': 'private, max-age=31536000, immutable' },
    });
  });

  return router;
}
