import { Router } from 'express';
import type { DB } from '../db';
import { personInputSchema, personPatchSchema } from '@shared/schemas';
import type { AppConfig } from '../config';
import { AppError, parseId } from '../middleware/errors';
import { onlyPresentKeys } from '../lib/patch';
import { createPerson, deletePerson, getPersonDetail, updatePerson } from '../services/personService';
import { deletePhotoFiles } from '../services/photoService';

export function createPersonsRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();

  router.get('/:id', (req, res) => {
    const detail = getPersonDetail(db, parseId(req.params.id));
    if (!detail) throw new AppError(404, 'not_found');
    res.json(detail);
  });

  router.post('/', (req, res) => {
    const input = personInputSchema.parse(req.body);
    const person = createPerson(db, input);
    res.status(201).json(getPersonDetail(db, person.id));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const patch = onlyPresentKeys(personPatchSchema.parse(req.body), req.body);
    updatePerson(db, id, patch);
    res.json(getPersonDetail(db, id));
  });

  router.delete('/:id', (req, res) => {
    const deleted = deletePerson(db, parseId(req.params.id));
    if (deleted.photo_id) deletePhotoFiles(cfg.dataDir, deleted.photo_id);
    res.status(204).end();
  });

  return router;
}
