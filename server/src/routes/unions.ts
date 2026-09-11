import { Router } from 'express';
import type { DB } from '../db';
import { unionInputSchema, unionPatchSchema } from '@shared/schemas';
import { parseId } from '../middleware/errors';
import { onlyPresentKeys } from '../lib/patch';
import { createUnion, deleteUnion, updateUnion } from '../services/unionService';

export function createUnionsRouter(db: DB): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = unionInputSchema.parse(req.body);
    res.status(201).json(createUnion(db, input));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const patch = onlyPresentKeys(unionPatchSchema.parse(req.body), req.body);
    res.json(updateUnion(db, id, patch));
  });

  router.delete('/:id', (req, res) => {
    deleteUnion(db, parseId(req.params.id));
    res.status(204).end();
  });

  return router;
}
