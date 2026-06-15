import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function requireAuth(cfg: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (cfg.authDisabled) return next();
    if (req.session?.authenticated === true) return next();
    // Javno čitanje: bezbedne (read-only) metode prolaze bez prijave; izmene i dalje traže lozinku.
    if (cfg.publicRead && SAFE_METHODS.has(req.method)) return next();
    res.status(401).json({ error: 'unauthorized' });
  };
}

/**
 * Odbija sve mutacije (POST/PATCH/PUT/DELETE) za sesije prijavljene read-only lozinkom.
 * Montira se posle requireAuth — pravi je čuvar pristupa samo za pregled (UI samo skriva dugmad).
 */
export function blockReadonlyWrites(cfg: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (cfg.authDisabled) return next();
    if (req.session?.readonly === true && !SAFE_METHODS.has(req.method)) {
      res.status(403).json({ error: 'forbidden_readonly', message: 'Nalog ima pravo samo na pregled' });
      return;
    }
    next();
  };
}
