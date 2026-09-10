import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import type { Express } from 'express';
import type { DB } from './db';
import { photosDir } from './services/photoService';
import { MAX_PENDING_PER_TOKEN } from './services/proposalService';
import { insertPerson, testApp } from './testHelpers';

const PHOTO_ID = '0a1b2c3d-1111-4222-8333-444455556666';
const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function createToken(app: Express): Promise<{ id: number; token: string }> {
  const res = await request(app)
    .post('/api/proposals/manage/tokens')
    .send({ label: 'Rođaci iz Niša', expires_in_days: 30 })
    .expect(201);
  return { id: res.body.id as number, token: res.body.token as string };
}

/** Važeći token upisan direktno u bazu (za testove sa uključenom prijavom). */
function insertToken(db: DB, token = 'tok-123'): string {
  db.prepare('INSERT INTO proposal_tokens (token, label, expires_at) VALUES (?, ?, ?)').run(token, 'Test', future());
  return token;
}

const newPerson = (temp_id: string, first_name: string, extra: Record<string, unknown> = {}) => ({
  temp_id,
  first_name,
  last_name: 'Petrović',
  ...extra,
});

function submit(app: Express, token: string, body: Record<string, unknown>) {
  return request(app)
    .post(`/api/proposals/public/tokens/${token}/submit`)
    .send({ author_name: 'Jovan Petrović', ...body });
}

function count(db: DB, table: 'persons' | 'unions'): number {
  return (db.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as { n: number }).n;
}

describe('pozivni linkovi', () => {
  it('rok važenja je obavezan (7/30/90 dana); opozvan link više ne važi', async () => {
    const { app } = testApp();
    await request(app).post('/api/proposals/manage/tokens').send({ label: 'Bez roka' }).expect(400);
    await request(app).post('/api/proposals/manage/tokens').send({ label: 'Čudan rok', expires_in_days: 45 }).expect(400);

    const res = await request(app)
      .post('/api/proposals/manage/tokens')
      .send({ label: 'Nedelja', expires_in_days: 7 })
      .expect(201);
    const days = (Date.parse(res.body.expires_at) - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(6.9);
    expect(days).toBeLessThan(7.1);

    const info = await request(app).get(`/api/proposals/public/tokens/${res.body.token}`).expect(200);
    expect(info.body).toEqual({ label: 'Nedelja', expires_at: res.body.expires_at });

    await request(app).delete(`/api/proposals/manage/tokens/${res.body.id}`).expect(204);
    await request(app).get(`/api/proposals/public/tokens/${res.body.token}`).expect(404);
  });

  it('istekao link i stari link bez roka ne važe', async () => {
    const { app, db } = testApp();
    const { token } = await createToken(app);
    db.prepare('UPDATE proposal_tokens SET expires_at = ?').run(new Date(Date.now() - 1000).toISOString());
    await request(app).get(`/api/proposals/public/tokens/${token}`).expect(404);

    db.prepare("INSERT INTO proposal_tokens (token, label) VALUES ('stari', 'Bez roka')").run();
    await request(app).get('/api/proposals/public/tokens/stari').expect(404);
  });

  it('link daje stablo i sličice i kad je prijava uključena — ali ne i ostale rute', async () => {
    const { app, db, cfg } = testApp({ authDisabled: false });
    insertPerson(db, { first_name: 'Marko', last_name: 'Kraljević' });
    const token = insertToken(db);
    fs.mkdirSync(photosDir(cfg.dataDir), { recursive: true });
    fs.writeFileSync(path.join(photosDir(cfg.dataDir), `${PHOTO_ID}.thumb.webp`), 'SLICICA');

    await request(app).get('/api/tree').expect(401);
    await request(app).get(`/api/photos/${PHOTO_ID}?size=thumb`).expect(401);
    await request(app).get('/api/proposals').expect(401);

    const tree = await request(app).get(`/api/proposals/public/tokens/${token}/tree`).expect(200);
    expect(tree.body.persons).toHaveLength(1);

    const photo = await request(app).get(`/api/proposals/public/tokens/${token}/photos/${PHOTO_ID}`).expect(200);
    expect(photo.body.toString()).toBe('SLICICA');
    await request(app).get(`/api/proposals/public/tokens/pogresan/photos/${PHOTO_ID}`).expect(404);
    await request(app).get(`/api/proposals/public/tokens/${token}/photos/..%2Fbaza`).expect(400);
  });
});

describe('pristup administratorskim rutama', () => {
  it('read-only sesija → 403 i za čitanje', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna', readonlyPassword: 'pregled' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'pregled' }).expect(204);

    for (const url of ['/api/proposals', '/api/proposals/count', '/api/proposals/manage/tokens', '/api/proposals/1']) {
      const res = await agent.get(url);
      expect(res.status, url).toBe(403);
    }
    expect((await agent.post('/api/proposals/1/approve').send({})).status).toBe(403);
  });

  it('gost javnog čitanja → 403 za čitanje, 401 za izmene', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna', publicRead: true });
    const list = await request(app).get('/api/proposals');
    expect(list.status).toBe(403);
    expect(list.body.error).toBe('forbidden_admin');
    await request(app).post('/api/proposals/manage/tokens').send({ label: 'x', expires_in_days: 7 }).expect(401);
  });

  it('puna lozinka → pristup; neispravan filter statusa → 400', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'puna' }).expect(204);
    await agent.get('/api/proposals?status=pending').expect(200);
    await agent.get('/api/proposals?status=nesto').expect(400);
  });
});

describe('slanje predloga', () => {
  it('odbija neispravne veze sa opisom problema (422)', async () => {
    const { app, db } = testApp();
    const mara = insertPerson(db, { first_name: 'Mara', gender: 'F' });
    const jovan = insertPerson(db, { first_name: 'Jovan', gender: 'M', mother_id: mara });
    const { token } = await createToken(app);

    const unknownRef = await submit(app, token, { persons: [newPerson('n1', 'Ana', { father_id: 'nema' })] }).expect(422);
    expect(unknownRef.body.error).toBe('invalid_proposal');
    expect(unknownRef.body.issues[0].code).toBe('unknown_ref');

    const gender = await submit(app, token, { persons: [newPerson('n1', 'Ana', { father_id: mara })] }).expect(422);
    expect(gender.body.issues[0].code).toBe('parent_gender');

    const slot = await submit(app, token, {
      persons: [newPerson('n1', 'Stana', { gender: 'F' })],
      parent_links: [{ child_id: jovan, parent_id: 'n1', role: 'mother' }],
    }).expect(422);
    expect(slot.body.issues[0].code).toBe('parent_slot_taken');

    const tooMany = Array.from({ length: 51 }, (_, i) => newPerson(`n${i}`, `Osoba${i}`));
    await submit(app, token, { persons: tooMany }).expect(400);
    await submit(app, 'pogresan', { persons: [newPerson('n1', 'Ana')] }).expect(404);
  });

  it(`najviše ${MAX_PENDING_PER_TOKEN} predloga na čekanju po linku`, async () => {
    const { app, db } = testApp();
    const { id, token } = await createToken(app);
    const insert = db.prepare("INSERT INTO proposals (token_id, author_name, data) VALUES (?, 'x', '{}')");
    for (let i = 0; i < MAX_PENDING_PER_TOKEN; i++) insert.run(id);

    const res = await submit(app, token, { persons: [newPerson('n1', 'Ana')] }).expect(429);
    expect(res.body.error).toBe('too_many_pending');
  });

  it('ograničava broj slanja po IP adresi', async () => {
    const { app } = testApp();
    const { token } = await createToken(app);
    for (let i = 0; i < 10; i++) await submit(app, token, {}).expect(400);
    const res = await submit(app, token, {}).expect(429);
    expect(res.body.error).toBe('rate_limited');
  });
});

describe('odobravanje i odbijanje', () => {
  it('ceo ciklus: nove osobe (i dete pre roditelja), roditelj postojećoj osobi, brakovi', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar', gender: 'M', birth_date: '1940' });
    const mara = insertPerson(db, { first_name: 'Mara', gender: 'F', birth_date: '1945' });
    const jovan = insertPerson(db, { first_name: 'Jovan', gender: 'M', father_id: petar });
    db.prepare('INSERT INTO unions (partner1_id, partner2_id) VALUES (?, ?)').run(petar, mara);
    const { token } = await createToken(app);

    const union = (a: unknown, b: unknown, start_date: string | null = null) => ({
      partner1_id: a,
      partner2_id: b,
      type: 'marriage',
      start_date,
    });
    const sent = await submit(app, token, {
      notes: 'Dodajem porodicu',
      persons: [
        newPerson('n3', 'Luka', { gender: 'M', father_id: 'n1', mother_id: 'n2' }),
        newPerson('n1', 'Miloš', { gender: 'M', birth_date: '1970-05-12', father_id: petar }),
        newPerson('n2', 'Jelena', { gender: 'F', maiden_name: 'Jovanović' }),
        newPerson('n4', 'Stana', { gender: 'F' }),
      ],
      unions: [union('n1', 'n2', '1995'), union(mara, petar)],
      parent_links: [{ child_id: jovan, parent_id: 'n4', role: 'mother' }],
    }).expect(201);

    expect((await request(app).get('/api/proposals/count').expect(200)).body.count).toBe(1);
    const list = await request(app).get('/api/proposals?status=pending').expect(200);
    expect(list.body[0]).toMatchObject({ author_name: 'Jovan Petrović', person_count: 4, union_count: 2, token_label: 'Rođaci iz Niša' });

    const detail = await request(app).get(`/api/proposals/${sent.body.id}`).expect(200);
    expect(detail.body.data.refs[String(petar)]).toEqual({ first_name: 'Petar', last_name: '', birth_date: '1940' });
    expect(detail.body.created_at).toMatch(/Z$/);

    const approved = await request(app).post(`/api/proposals/${sent.body.id}/approve`).send({}).expect(200);
    expect(approved.body).toEqual({
      persons_created: 4,
      persons_merged: 0,
      parent_links_applied: 1,
      unions_created: 1,
      unions_skipped: 1,
    });

    const byName = (name: string) =>
      db.prepare('SELECT id, father_id, mother_id FROM persons WHERE first_name = ?').get(name) as {
        id: number;
        father_id: number | null;
        mother_id: number | null;
      };
    const milos = byName('Miloš');
    const jelena = byName('Jelena');
    expect(milos.father_id).toBe(petar);
    expect(byName('Luka')).toMatchObject({ father_id: milos.id, mother_id: jelena.id });
    expect(byName('Jovan').mother_id).toBe(byName('Stana').id);
    expect(count(db, 'unions')).toBe(2);

    const after = await request(app).get(`/api/proposals/${sent.body.id}`).expect(200);
    expect(after.body.status).toBe('approved');
    expect((await request(app).get('/api/proposals/count')).body.count).toBe(0);

    const again = await request(app).post(`/api/proposals/${sent.body.id}/approve`).send({}).expect(409);
    expect(again.body.error).toBe('not_pending');
  });

  it('blokira spajanje kad ID postojeće osobe sada pokazuje na nekog drugog', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar', gender: 'M' });
    const { token } = await createToken(app);
    const sent = await submit(app, token, { persons: [newPerson('n1', 'Ana', { father_id: petar })] }).expect(201);

    // npr. restore kopije ili GEDCOM uvoz je dodelio isti ID drugoj osobi
    db.prepare("UPDATE persons SET first_name = 'Zoran', last_name = 'Ilić' WHERE id = ?").run(petar);

    const res = await request(app).post(`/api/proposals/${sent.body.id}/approve`).send({}).expect(409);
    expect(res.body.error).toBe('proposal_conflict');
    expect(res.body.issues[0].code).toBe('stale_ref');
    expect(count(db, 'persons')).toBe(1);
  });

  it('kad je mesto roditelja u međuvremenu popunjeno, ništa se ne upisuje', async () => {
    const { app, db } = testApp();
    const mara = insertPerson(db, { first_name: 'Mara', gender: 'F' });
    const jovan = insertPerson(db, { first_name: 'Jovan', gender: 'M' });
    const { token } = await createToken(app);
    const sent = await submit(app, token, {
      persons: [newPerson('n1', 'Stana', { gender: 'F' }), newPerson('n2', 'Luka', { gender: 'M' })],
      parent_links: [{ child_id: jovan, parent_id: 'n1', role: 'mother' }],
    }).expect(201);

    db.prepare('UPDATE persons SET mother_id = ? WHERE id = ?').run(mara, jovan);

    const res = await request(app).post(`/api/proposals/${sent.body.id}/approve`).send({}).expect(409);
    expect(res.body.issues[0].code).toBe('parent_slot_taken');
    expect(count(db, 'persons')).toBe(2);
  });

  it('duplikat se rešava spajanjem sa postojećom osobom', async () => {
    const { app, db } = testApp();
    const jovan = insertPerson(db, { first_name: 'Jovan', last_name: 'Petrović', gender: 'M', birth_date: '1970' });
    const { token } = await createToken(app);
    const sent = await submit(app, token, {
      persons: [
        newPerson('n1', 'Jovan', { gender: 'M', birth_date: '1971' }),
        newPerson('n2', 'Luka', { gender: 'M', father_id: 'n1' }),
      ],
    }).expect(201);

    await request(app)
      .post(`/api/proposals/${sent.body.id}/approve`)
      .send({ merges: [{ temp_id: 'n1', person_id: 999 }] })
      .expect(409);
    await request(app)
      .post(`/api/proposals/${sent.body.id}/approve`)
      .send({ merges: [{ temp_id: 'n1' }] })
      .expect(400);

    const res = await request(app)
      .post(`/api/proposals/${sent.body.id}/approve`)
      .send({ merges: [{ temp_id: 'n1', person_id: jovan }] })
      .expect(200);
    expect(res.body).toMatchObject({ persons_created: 1, persons_merged: 1 });
    const luka = db.prepare("SELECT father_id FROM persons WHERE first_name = 'Luka'").get() as { father_id: number };
    expect(luka.father_id).toBe(jovan);
    expect(count(db, 'persons')).toBe(2);
  });

  it('odbijanje ne menja stablo; pregledan predlog se ne može ponovo pregledati', async () => {
    const { app, db } = testApp();
    const { token } = await createToken(app);
    const sent = await submit(app, token, { persons: [newPerson('n1', 'Neko', { gender: 'U' })] }).expect(201);

    await request(app)
      .post(`/api/proposals/${sent.body.id}/reject`)
      .send({ review_notes: 'Nepotpuni podaci' })
      .expect(204);
    const detail = await request(app).get(`/api/proposals/${sent.body.id}`).expect(200);
    expect(detail.body).toMatchObject({ status: 'rejected', review_notes: 'Nepotpuni podaci' });
    expect(detail.body.reviewed_at).toMatch(/Z$/);

    await request(app).post(`/api/proposals/${sent.body.id}/reject`).send({}).expect(409);
    await request(app).post(`/api/proposals/${sent.body.id}/approve`).send({}).expect(409);
    expect(count(db, 'persons')).toBe(0);
  });
});
