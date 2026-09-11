import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DB } from '../db';
import type { AppConfig } from '../config';
import { branchChangeKeysSchema, createProposalTokenSchema, enterBranchSchema } from '@shared/schemas';
import type { PublicTokenInfo } from '@shared/types';
import { requireFullAccess } from '../middleware/auth';
import { AppError, parseId } from '../middleware/errors';
import {
  assertTokenExists,
  branchChangesResponse,
  computeChanges,
  createToken,
  discardChanges,
  getToken,
  listTokens,
  mergeChanges,
  pendingReviewCount,
  requireOpenToken,
  revokeToken,
} from '../services/branchService';

/** :token iz putanje — Express tipovi ga ne sužavaju na string kad ispred handler-a stoji middleware. */
function tokenParam(req: { params: Record<string, unknown> }): string {
  const token = req.params.token;
  if (typeof token !== 'string') throw new AppError(400, 'validation', 'Nedostaje pozivni link');
  return token;
}

/**
 * Javni ruter za pozivni link — montira se PRE requireAuth. Link se samo proverava i
 * otvara režim predloga u sesiji; sve dalje ide kroz rute grane (routes/branch.ts).
 */
export function createPublicProposalsRouter(db: DB): Router {
  const router = Router();
  const limiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited', message: 'Previše zahteva — pokušajte ponovo za nekoliko minuta' });
    },
  });

  router.get('/tokens/:token', limiter, (req, res) => {
    const row = requireOpenToken(db, tokenParam(req));
    const info: PublicTokenInfo = { label: row.label, expires_at: row.expires_at };
    res.json(info);
  });

  router.post('/tokens/:token/enter', limiter, async (req, res) => {
    const row = requireOpenToken(db, tokenParam(req));
    const { author_name } = enterBranchSchema.parse(req.body);
    req.session.branch = { token_id: row.id, author: author_name };
    await req.session.save();
    res.status(204).end();
  });

  return router;
}

/**
 * Administrator: pozivni linkovi i pregled/spajanje grana.
 * requireFullAccess — read-only sesije i gosti javnog čitanja nemaju pristup ni za GET.
 */
export function createAdminProposalsRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  router.use(requireFullAccess(cfg));

  router.get('/count', (_req, res) => {
    res.json({ count: pendingReviewCount(db) });
  });

  router.get('/manage/tokens', (_req, res) => {
    res.json(listTokens(db));
  });

  router.post('/manage/tokens', (req, res) => {
    const input = createProposalTokenSchema.parse(req.body);
    res.status(201).json(createToken(db, input));
  });

  router.get('/manage/tokens/:id', (req, res) => {
    res.json(getToken(db, parseId(req.params.id)));
  });

  router.delete('/manage/tokens/:id', (req, res) => {
    revokeToken(db, parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/manage/tokens/:id/changes', (req, res) => {
    const id = parseId(req.params.id);
    assertTokenExists(db, id);
    res.json(branchChangesResponse(computeChanges(db, id)));
  });

  router.post('/manage/tokens/:id/merge', (req, res) => {
    const id = parseId(req.params.id);
    const { keys } = branchChangeKeysSchema.parse(req.body);
    res.json(mergeChanges(db, cfg.dataDir, id, keys));
  });

  router.post('/manage/tokens/:id/discard', (req, res) => {
    const id = parseId(req.params.id);
    const { keys } = branchChangeKeysSchema.parse(req.body);
    discardChanges(db, cfg.dataDir, id, keys);
    res.status(204).end();
  });

  return router;
}
