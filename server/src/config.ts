import fs from 'node:fs';
import dotenv from 'dotenv';

export interface AppConfig {
  nodeEnv: string;
  port: number;
  dataDir: string;
  authDisabled: boolean;
  authPassword: string;
  /** Opciona lozinka za pristup samo za pregled (read-only). Prazno = isključeno. */
  readonlyPassword: string;
  sessionSecret: string;
  clientDist: string;
}

/** Učitava prvi postojeći .env (cwd je server/ kad se pokreće kroz workspace). */
export function loadEnvFile(): void {
  for (const p of ['.env', '../.env']) {
    if (fs.existsSync(p)) {
      dotenv.config({ path: p, quiet: true });
      return;
    }
  }
}

function parseBool(value: string | undefined): boolean {
  if (!value) return false;
  return !['false', '0', 'no', 'off'].includes(value.trim().toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const nodeEnv = env.NODE_ENV ?? 'development';
  const authDisabled = parseBool(env.AUTH_DISABLED);

  // FAIL-SAFE: produkcija nikad ne sme da se digne bez auth-a.
  if (nodeEnv === 'production' && authDisabled) {
    throw new Error('AUTH_DISABLED nije dozvoljen u produkciji — server odbija pokretanje.');
  }

  const authPassword = env.AUTH_PASSWORD ?? '';
  const readonlyPassword = env.READONLY_PASSWORD ?? '';
  let sessionSecret = env.SESSION_SECRET ?? '';

  if (readonlyPassword !== '' && readonlyPassword === authPassword) {
    throw new Error('READONLY_PASSWORD mora biti različit od AUTH_PASSWORD.');
  }

  if (nodeEnv === 'production') {
    if (!authPassword) {
      throw new Error('AUTH_PASSWORD je obavezan u produkciji.');
    }
    if (sessionSecret.length < 32) {
      throw new Error('SESSION_SECRET mora imati najmanje 32 karaktera u produkciji.');
    }
  } else if (sessionSecret.length < 32) {
    sessionSecret = 'dev-secret-'.padEnd(32, 'x');
  }

  const port = Number(env.PORT ?? 3001);
  if (!Number.isInteger(port) || port < 0 || port > 65535) {
    throw new Error(`Neispravan PORT: ${env.PORT}`);
  }

  return {
    nodeEnv,
    port,
    dataDir: env.DATA_DIR ?? '../data',
    authDisabled,
    authPassword,
    readonlyPassword,
    sessionSecret,
    clientDist: env.CLIENT_DIST ?? '../client/dist',
  };
}
