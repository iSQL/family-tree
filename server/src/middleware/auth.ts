import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

export function requireAuth(cfg: AppConfig): RequestHandler {
  return (req, res, next) => {
    if (cfg.authDisabled) return next();
    if (req.session?.authenticated === true) return next();
    res.status(401).json({ error: 'unauthorized' });
  };
}
