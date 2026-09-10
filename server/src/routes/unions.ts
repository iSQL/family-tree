import { Router } from 'express';
import type { DB } from '../db';
import { unionInputSchema, unionPatchSchema } from '@shared/schemas';
import { AppError, parseId } from '../middleware/errors';
import { onlyPresentKeys } from '../lib/patch';
import { createUnion, getUnion } from '../services/unionService';

export function createUnionsRouter(db: DB): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = unionInputSchema.parse(req.body);
    res.status(201).json(createUnion(db, input));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!getUnion(db, id)) throw new AppError(404, 'not_found');
    const patch = onlyPresentKeys(unionPatchSchema.parse(req.body), req.body);
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length > 0) {
      const setSql = entries.map(([k]) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE unions SET ${setSql} WHERE id = @__id`).run({ ...Object.fromEntries(entries), __id: id });
    }
    res.json(getUnion(db, id));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const info = db.prepare('DELETE FROM unions WHERE id = ?').run(id);
    if (info.changes === 0) throw new AppError(404, 'not_found');
    res.status(204).end();
  });

  return router;
}
