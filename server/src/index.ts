import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { pino } from 'pino';
import { loadConfig, loadEnvFile } from './config';
import { openDb } from './db';
import { createApp } from './app';
import { startBackupTimer } from './services/backup';

loadEnvFile();
const baseCfg = loadConfig();
const dataDir = path.resolve(baseCfg.dataDir);
const cfg = { ...baseCfg, dataDir };

fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'backups'), { recursive: true });

const logger = pino({ level: cfg.nodeEnv === 'production' ? 'info' : 'debug' });
const db = openDb(path.join(dataDir, 'familytree.db'));
const app = createApp(cfg, db);

// U produkciji server služi i klijentski build (same-origin, bez CORS-a).
if (cfg.nodeEnv === 'production') {
  const clientDist = path.resolve(cfg.clientDist);
  app.use(express.static(clientDist));
  // SPA fallback za ne-/api GET rute
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

startBackupTimer(db, path.join(dataDir, 'backups'), (msg) => logger.info(msg));

app.listen(cfg.port, () => {
  logger.info(
    `Server sluša na portu ${cfg.port} (${cfg.nodeEnv}, auth ${cfg.authDisabled ? 'isključen' : 'uključen'}, data: ${dataDir})`,
  );
});
