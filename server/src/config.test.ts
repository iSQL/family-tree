import { describe, expect, it } from 'vitest';
import { loadConfig } from './config';

const prodEnv = {
  NODE_ENV: 'production',
  AUTH_PASSWORD: 'porodicna-lozinka',
  SESSION_SECRET: 's'.repeat(64),
};

describe('loadConfig', () => {
  it('FAIL-SAFE: production + AUTH_DISABLED baca grešku', () => {
    expect(() => loadConfig({ ...prodEnv, AUTH_DISABLED: 'true' })).toThrow(/AUTH_DISABLED/);
    expect(() => loadConfig({ ...prodEnv, AUTH_DISABLED: '1' })).toThrow(/AUTH_DISABLED/);
  });

  it('production zahteva AUTH_PASSWORD', () => {
    expect(() => loadConfig({ ...prodEnv, AUTH_PASSWORD: '' })).toThrow(/AUTH_PASSWORD/);
    expect(() => loadConfig({ NODE_ENV: 'production', SESSION_SECRET: 's'.repeat(64) })).toThrow(/AUTH_PASSWORD/);
  });

  it('production zahteva SESSION_SECRET od najmanje 32 karaktera', () => {
    expect(() => loadConfig({ ...prodEnv, SESSION_SECRET: 'kratak' })).toThrow(/SESSION_SECRET/);
    expect(() => loadConfig({ ...prodEnv, SESSION_SECRET: undefined })).toThrow(/SESSION_SECRET/);
  });

  it('ispravna produkciona konfiguracija prolazi', () => {
    const cfg = loadConfig(prodEnv);
    expect(cfg.nodeEnv).toBe('production');
    expect(cfg.authDisabled).toBe(false);
    expect(cfg.port).toBe(3001);
  });

  it('dev: podrazumevane vrednosti + dopunjen sessionSecret', () => {
    const cfg = loadConfig({});
    expect(cfg.nodeEnv).toBe('development');
    expect(cfg.port).toBe(3001);
    expect(cfg.dataDir).toBe('../data');
    expect(cfg.clientDist).toBe('../client/dist');
    expect(cfg.sessionSecret.length).toBeGreaterThanOrEqual(32);
  });

  it('dev: AUTH_DISABLED=false/0 se tumači kao isključeno', () => {
    expect(loadConfig({ AUTH_DISABLED: 'false' }).authDisabled).toBe(false);
    expect(loadConfig({ AUTH_DISABLED: '0' }).authDisabled).toBe(false);
    expect(loadConfig({ AUTH_DISABLED: 'true' }).authDisabled).toBe(true);
  });

  it('neispravan PORT baca grešku', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(/PORT/);
  });
});
