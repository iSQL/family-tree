import type { RequestHandler } from 'express';

const MUTATING = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/** Ako Origin header postoji i nije same-origin sa Host → 403. Bez Origin headera propušta. */
export const csrfOriginCheck: RequestHandler = (req, res, next) => {
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
  if (originHost !== req.headers.host) {
    res.status(403).json({ error: 'csrf', message: 'Zahtev sa drugog porekla je odbijen' });
    return;
  }
  next();
};
