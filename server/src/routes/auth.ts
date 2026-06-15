import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { createHash, timingSafeEqual } from 'node:crypto';
import { loginSchema } from '@shared/schemas';
import type { SessionInfo } from '@shared/types';
import type { AppConfig } from '../config';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Heširanje obe strane izjednačava dužine za timingSafeEqual. */
function passwordsEqual(supplied: string, expected: string): boolean {
  const a = createHash('sha256').update(supplied).digest();
  const b = createHash('sha256').update(expected).digest();
  return timingSafeEqual(a, b);
}

export function createAuthRouter(cfg: AppConfig): Router {
  const router = Router();

  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, res) => {
      res.status(429).json({ error: 'rate_limited', message: 'Previše pokušaja prijave — pokušajte ponovo za 15 minuta' });
    },
  });

  router.post('/login', loginLimiter, async (req, res) => {
    const { password } = loginSchema.parse(req.body);
    // Obe provere se uvek izvršavaju (bez ranog izlaska) da se ne otkrije koja je lozinka pogođena.
    const fullOk = cfg.authPassword !== '' && passwordsEqual(password, cfg.authPassword);
    const readonlyOk = cfg.readonlyPassword !== '' && passwordsEqual(password, cfg.readonlyPassword);
    if (!cfg.authDisabled && !fullOk && !readonlyOk) {
      await sleep(500);
      res.status(401).json({ error: 'invalid_credentials', message: 'Pogrešna lozinka' });
      return;
    }
    req.session.authenticated = true;
    // Read-only samo ako je pogođena ISKLJUČIVO read-only lozinka (puna lozinka uvek daje pun pristup).
    req.session.readonly = !cfg.authDisabled && !fullOk && readonlyOk;
    await req.session.save();
    res.status(204).end();
  });

  router.post('/logout', (req, res) => {
    req.session.destroy();
    res.status(204).end();
  });

  router.get('/session', (req, res) => {
    const info: SessionInfo = {
      authenticated: cfg.authDisabled ? true : req.session.authenticated === true,
      auth_mode: cfg.authDisabled ? 'disabled' : 'password',
      readonly: !cfg.authDisabled && req.session.readonly === true,
      public_read: !cfg.authDisabled && cfg.publicRead,
    };
    res.json(info);
  });

  return router;
}
