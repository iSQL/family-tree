import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { testApp } from './testHelpers';

describe('auth — password mode', () => {
  it('GET /api/tree bez sesije → 401', async () => {
    const { app } = testApp({ authDisabled: false });
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(401);
    expect(res.body).toEqual({ error: 'unauthorized' });
  });

  it('pogrešna lozinka → 401 (uz delay)', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'tacna-lozinka' });
    const res = await request(app).post('/api/auth/login').send({ password: 'pogresna' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBe('invalid_credentials');
  });

  it('prazno telo → 400 validation', async () => {
    const { app } = testApp({ authDisabled: false });
    const res = await request(app).post('/api/auth/login').send({});
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('tačna lozinka → 204 + cookie radi za zaštićene rute', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'tacna-lozinka' });
    const agent = request.agent(app);

    const login = await agent.post('/api/auth/login').send({ password: 'tacna-lozinka' });
    expect(login.status).toBe(204);
    expect(login.headers['set-cookie']?.[0]).toContain('ft_session=');

    const tree = await agent.get('/api/tree');
    expect(tree.status).toBe(200);

    const session = await agent.get('/api/auth/session');
    expect(session.body).toEqual({ authenticated: true, auth_mode: 'password' });

    const logout = await agent.post('/api/auth/logout');
    expect(logout.status).toBe(204);
    const after = await agent.get('/api/tree');
    expect(after.status).toBe(401);
  });

  it('rate limit: 11. zahtev na login → 429', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'tacna-lozinka' });
    for (let i = 0; i < 10; i++) {
      const res = await request(app).post('/api/auth/login').send({ password: 'tacna-lozinka' });
      expect(res.status).toBe(204);
    }
    const blocked = await request(app).post('/api/auth/login').send({ password: 'tacna-lozinka' });
    expect(blocked.status).toBe(429);
    expect(blocked.body.error).toBe('rate_limited');
  });

  it('CSRF: mutacija sa stranim Origin headerom → 403', async () => {
    const { app } = testApp({ authDisabled: false });
    const res = await request(app)
      .post('/api/auth/login')
      .set('Origin', 'https://zlonamerni.example.com')
      .send({ password: 'bilo-sta' });
    expect(res.status).toBe(403);
    expect(res.body.error).toBe('csrf');
  });
});

describe('auth — disabled mode', () => {
  it('session vraća auth_mode disabled, zaštićene rute rade bez prijave', async () => {
    const { app } = testApp({ authDisabled: true });
    const session = await request(app).get('/api/auth/session');
    expect(session.body).toEqual({ authenticated: true, auth_mode: 'disabled' });

    const tree = await request(app).get('/api/tree');
    expect(tree.status).toBe(200);
  });
});

describe('zajedničko', () => {
  it('GET /api/health radi bez auth-a', async () => {
    const { app } = testApp({ authDisabled: false });
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ ok: true });
  });

  it('nepoznata /api ruta → 404 not_found', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/nepostojeca');
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'not_found' });
  });
});
