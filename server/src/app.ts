import express from 'express';
import helmet from 'helmet';
import { pinoHttp } from 'pino-http';
import { getIronSession, type SessionOptions } from 'iron-session';
import type { DB } from './db';
import type { AppConfig } from './config';
import type { SessionData } from './middleware/session';
import { blockReadonlyWrites, requireAuth } from './middleware/auth';
import { createCsrfOriginCheck } from './middleware/csrfOrigin';
import { createErrorHandler } from './middleware/errors';
import { createAuthRouter } from './routes/auth';
import { createTreeRouter } from './routes/tree';
import { createPersonsRouter } from './routes/persons';
import { createUnionsRouter } from './routes/unions';
import { createPhotosRouter } from './routes/photos';
import { createGedcomRouter } from './routes/gedcom';

/** Sklapa Express app bez listen-a — supertest radi direktno nad njim. */
export function createApp(cfg: AppConfig, db: DB): express.Express {
  const app = express();

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'blob:', 'data:'],
        },
      },
    }),
  );

  if (cfg.nodeEnv !== 'test') {
    app.use(pinoHttp());
  }

  app.use(express.json({ limit: '1mb' }));

  const sessionOptions: SessionOptions = {
    cookieName: 'ft_session',
    password: cfg.sessionSecret,
    ttl: 30 * 24 * 60 * 60,
    cookieOptions: {
      httpOnly: true,
      sameSite: 'lax',
      secure: cfg.nodeEnv === 'production',
    },
  };
  app.use(async (req, res, next) => {
    req.session = await getIronSession<SessionData>(req, res, sessionOptions);
    next();
  });

  app.use(createCsrfOriginCheck(cfg));

  app.get('/api/health', (_req, res) => {
    res.json({ ok: true });
  });
  app.use('/api/auth', createAuthRouter(cfg));

  // sve ispod je iza auth-a
  app.use('/api', requireAuth(cfg));
  app.use('/api', blockReadonlyWrites(cfg));
  app.use('/api/tree', createTreeRouter(db));
  app.use('/api/persons', createPersonsRouter(db, cfg));
  app.use('/api/unions', createUnionsRouter(db));
  app.use('/api', createPhotosRouter(db, cfg));
  app.use('/api/gedcom', createGedcomRouter(db));

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'not_found' });
  });
  app.use(createErrorHandler(cfg));

  return app;
}
