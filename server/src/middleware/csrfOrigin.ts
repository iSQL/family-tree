import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Skida port sa host headera: 'localhost:5173' → 'localhost', '[::1]:3001' → '[::1]'. */
function hostname(host: string | undefined): string {
  if (!host) return '';
  if (host.startsWith('[')) return host.slice(0, host.indexOf(']') + 1); // IPv6
  const i = host.lastIndexOf(':');
  return i === -1 ? host : host.slice(0, i);
}

/**
 * Defense-in-depth protiv CSRF za cookie-auth: mutacija sa stranog Origin-a → 403.
 * Bez Origin headera (npr. ne-browser klijent) propušta.
 *
 * Produkcija (iza HTTPS reverse proxy-ja): Origin i Host moraju biti identični.
 * Dev: klijent (Vite :5173) i API (:3001) se razlikuju po portu zbog proxy-ja,
 * pa se porede samo hostnames (localhost ↔ localhost prolazi).
 */
export function createCsrfOriginCheck(cfg: AppConfig): RequestHandler {
  const strict = cfg.nodeEnv === 'production';
  return (req, res, next) => {
    if (!MUTATING.has(req.method)) return next();
    const origin = req.headers.origin;
    if (!origin) return next();

    let originHost: string;
    try {
      originHost = new URL(origin).host;
    } catch {
      res.status(403).json({ error: 'csrf', message: 'Neispravan Origin header' });
      return;
    }

    const ok = strict
      ? originHost === req.headers.host
      : hostname(originHost) === hostname(req.headers.host);
    if (!ok) {
      res.status(403).json({ error: 'csrf', message: 'Zahtev sa drugog porekla je odbijen' });
      return;
    }
    next();
  };
}
