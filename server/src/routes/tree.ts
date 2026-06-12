import { Router } from 'express';
import type { DB } from '../db';
import { getTree } from '../services/personService';

export function createTreeRouter(db: DB): Router {
  const router = Router();
  router.get('/', (_req, res) => {
    res.json(getTree(db));
  });
  return router;
}
