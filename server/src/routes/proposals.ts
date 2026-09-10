import fs from 'node:fs';
import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import type { DB } from '../db';
import type { AppConfig } from '../config';
import {
  approveProposalSchema,
  createProposalTokenSchema,
  proposalListQuerySchema,
  rejectProposalSchema,
  submitProposalSchema,
} from '@shared/schemas';
import type { PublicTokenInfo } from '@shared/types';
import { requireFullAccess } from '../middleware/auth';
import { AppError, parseId } from '../middleware/errors';
import { getTree } from '../services/personService';
import { PHOTO_ID_RE, photoFilePath } from '../services/photoService';
import {
  approveProposal,
  createToken,
  getPendingProposalsCount,
  getProposal,
  listProposals,
  listTokens,
  rejectProposal,
  requireValidToken,
  revokeToken,
  submitProposal,
} from '../services/proposalService';

function limiter(windowMinutes: number, limit: number, message: string) {
  return rateLimit({
    windowMs: windowMinutes * 60 * 1000,
    limit,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited', message });
    },
  });
}

/** :token iz putanje — Express tipovi ga ne sužavaju na string kad ispred handler-a stoji middleware. */
function tokenParam(req: { params: Record<string, unknown> }): string {
  const token = req.params.token;
  if (typeof token !== 'string') throw new AppError(400, 'validation', 'Nedostaje pozivni link');
  return token;
}

/**
 * Javni ruter za saradnike sa pozivnim linkom — montira se PRE requireAuth.
 * Token daje uvid u stablo (sa sličicama) i pravo slanja predloga — ništa više.
 */
export function createPublicProposalsRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  const readLimiter = limiter(15, 120, 'Previše zahteva — pokušajte ponovo za nekoliko minuta');
  const submitLimiter = limiter(60, 10, 'Poslato je previše predloga — pokušajte ponovo za sat vremena');

  router.get('/tokens/:token', readLimiter, (req, res) => {
    const token = requireValidToken(db, tokenParam(req));
    const info: PublicTokenInfo = { label: token.label, expires_at: token.expires_at };
    res.json(info);
  });

  router.get('/tokens/:token/tree', readLimiter, (req, res) => {
    requireValidToken(db, tokenParam(req));
    res.json(getTree(db));
  });

  // Sličice za kartice u stablu — /api/photos je iza prijave.
  router.get('/tokens/:token/photos/:uuid', (req, res) => {
    requireValidToken(db, tokenParam(req));
    const uuid = req.params.uuid;
    if (!PHOTO_ID_RE.test(uuid)) throw new AppError(400, 'validation', 'Neispravan identifikator slike');
    const file = photoFilePath(cfg.dataDir, uuid.toLowerCase(), 'thumb');
    if (!fs.existsSync(file)) throw new AppError(404, 'not_found');
    res.sendFile(file, { cacheControl: false, headers: { 'Cache-Control': 'private, max-age=3600' } });
  });

  router.post('/tokens/:token/submit', submitLimiter, (req, res) => {
    const input = submitProposalSchema.parse(req.body);
    res.status(201).json(submitProposal(db, tokenParam(req), input));
  });

  return router;
}

/**
 * Administratorski ruter: pozivni linkovi, pregled, spajanje i odbijanje predloga.
 * requireFullAccess — read-only sesije i gosti javnog čitanja nemaju pristup ni za GET.
 */
export function createAdminProposalsRouter(db: DB, cfg: AppConfig): Router {
  const router = Router();
  router.use(requireFullAccess(cfg));

  router.get('/count', (_req, res) => {
    res.json({ count: getPendingProposalsCount(db) });
  });

  router.get('/', (req, res) => {
    const { status } = proposalListQuerySchema.parse(req.query);
    res.json(listProposals(db, status));
  });

  router.get('/manage/tokens', (_req, res) => {
    res.json(listTokens(db));
  });

  router.post('/manage/tokens', (req, res) => {
    const input = createProposalTokenSchema.parse(req.body);
    res.status(201).json(createToken(db, input));
  });

  router.delete('/manage/tokens/:id', (req, res) => {
    revokeToken(db, parseId(req.params.id));
    res.status(204).end();
  });

  router.get('/:id', (req, res) => {
    const proposal = getProposal(db, parseId(req.params.id));
    if (!proposal) throw new AppError(404, 'not_found', 'Predlog nije pronađen');
    res.json(proposal);
  });

  router.post('/:id/approve', (req, res) => {
    const id = parseId(req.params.id);
    const input = approveProposalSchema.parse(req.body ?? {});
    res.json(approveProposal(db, id, input));
  });

  router.post('/:id/reject', (req, res) => {
    const id = parseId(req.params.id);
    const input = rejectProposalSchema.parse(req.body ?? {});
    rejectProposal(db, id, input);
    res.status(204).end();
  });

  return router;
}
