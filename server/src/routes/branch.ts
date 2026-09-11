import { Router, type Request } from 'express';
import multer from 'multer';
import { rateLimit } from 'express-rate-limit';
import type { DB } from '../db';
import type { AppConfig } from '../config';
import {
  branchChangeKeysSchema,
  personInputSchema,
  personPatchSchema,
  submitBranchSchema,
  unionInputSchema,
  unionPatchSchema,
} from '@shared/schemas';
import { onlyPresentKeys } from '../lib/patch';
import { AppError, parseId } from '../middleware/errors';
import {
  branchChangesResponse,
  branchCreatePerson,
  branchCreateUnion,
  branchDeletePerson,
  branchDeleteUnion,
  branchGetPerson,
  branchGetTree,
  branchUpdatePerson,
  branchUpdateUnion,
  computeChanges,
  discardChanges,
  isBranchOpen,
  submitBranch,
  type BranchContext,
} from '../services/branchService';
import { deletePhotoFiles, writePhotoFiles } from '../services/photoService';
import { servePhoto } from './photos';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

const ctx = (req: Request) => req.session.branch as BranchContext;

/**
 * Režim predloga — montira se na /api PRE requireAuth. Aktivan samo kad sesija nosi granu:
 * iste rute kao glavna aplikacija (stablo, osobe, brakovi, slike), ali nad granom linka.
 * Sve ostalo (GEDCOM, rezervne kopije, administracija) je zabranjeno.
 */
export function createBranchRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  router.use(async (req, res, next) => {
    const branch = req.session.branch;
    if (!branch) {
      next('router'); // obična sesija — dalje na glavne rute
      return;
    }
    if (!isBranchOpen(db, branch.token_id)) {
      delete req.session.branch;
      await req.session.save();
      res.status(403).json({ error: 'branch_closed', message: 'Pozivni link je istekao ili je opozvan' });
      return;
    }
    next();
  });

  router.use(
    rateLimit({
      windowMs: 15 * 60 * 1000,
      limit: 600,
      standardHeaders: true,
      legacyHeaders: false,
      skip: (req) => SAFE_METHODS.has(req.method),
      handler: (_req, res) => {
        res.status(429).json({ error: 'rate_limited', message: 'Previše izmena odjednom — pokušajte ponovo za nekoliko minuta' });
      },
    }),
  );

  router.get('/tree', (req, res) => {
    res.json(branchGetTree(db, ctx(req)));
  });

  router.get('/persons/:id', (req, res) => {
    res.json(branchGetPerson(db, ctx(req), parseId(req.params.id)));
  });

  router.post('/persons', (req, res) => {
    const input = personInputSchema.parse(req.body);
    res.status(201).json(branchCreatePerson(db, ctx(req), input));
  });

  router.patch('/persons/:id', (req, res) => {
    const id = parseId(req.params.id);
    const patch = onlyPresentKeys(personPatchSchema.parse(req.body), req.body);
    res.json(branchUpdatePerson(db, ctx(req), id, patch));
  });

  router.delete('/persons/:id', (req, res) => {
    branchDeletePerson(db, ctx(req), parseId(req.params.id));
    res.status(204).end();
  });

  // Slika: fajlovi se odmah upisuju (jedinstven uuid), ali osoba je dobija samo u grani.
  router.post('/persons/:id/photo', upload.single('photo'), async (req, res) => {
    const id = parseId(req.params.id);
    if (!req.file) throw new AppError(400, 'validation', 'Nedostaje fajl u polju "photo"');
    const branch = ctx(req);
    branchGetPerson(db, branch, id); // 404 ako osoba ne postoji u grani
    const photoId = await writePhotoFiles(cfg.dataDir, req.file.buffer);
    try {
      branchUpdatePerson(db, branch, id, { photo_id: photoId });
    } catch (err) {
      deletePhotoFiles(cfg.dataDir, photoId);
      throw err;
    }
    res.json({ photo_id: photoId });
  });

  router.delete('/persons/:id/photo', (req, res) => {
    branchUpdatePerson(db, ctx(req), parseId(req.params.id), { photo_id: null });
    res.status(204).end();
  });

  router.get('/photos/:uuid', servePhoto(cfg.dataDir));

  router.post('/unions', (req, res) => {
    const input = unionInputSchema.parse(req.body);
    res.status(201).json(branchCreateUnion(db, ctx(req), input));
  });

  router.patch('/unions/:id', (req, res) => {
    const id = parseId(req.params.id);
    const patch = onlyPresentKeys(unionPatchSchema.parse(req.body), req.body);
    res.json(branchUpdateUnion(db, ctx(req), id, patch));
  });

  router.delete('/unions/:id', (req, res) => {
    branchDeleteUnion(db, ctx(req), parseId(req.params.id));
    res.status(204).end();
  });

  // Izmene sopstvene (zajedničke) grane
  router.get('/proposals/branch/changes', (req, res) => {
    res.json(branchChangesResponse(computeChanges(db, ctx(req).token_id)));
  });

  router.post('/proposals/branch/discard', (req, res) => {
    const { keys } = branchChangeKeysSchema.parse(req.body);
    discardChanges(db, cfg.dataDir, ctx(req).token_id, keys);
    res.status(204).end();
  });

  router.post('/proposals/branch/submit', (req, res) => {
    const { note } = submitBranchSchema.parse(req.body ?? {});
    submitBranch(db, ctx(req), note);
    res.status(204).end();
  });

  router.use((_req, res) => {
    res.status(403).json({ error: 'forbidden_branch', message: 'Ovo nije dostupno u režimu predloga' });
  });

  return router;
}
