import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import request from 'supertest';
import sharp from 'sharp';
import type { Express } from 'express';
import type { BranchChangesResponse, PersonSlim, ProposalToken } from '@shared/types';
import type { DB } from './db';
import { BRANCH_ID_BASE } from './services/branchService';
import { photoFilePath } from './services/photoService';
import { insertPerson, testApp } from './testHelpers';

type Agent = ReturnType<typeof request.agent>;

const future = () => new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

async function createLink(app: Express): Promise<ProposalToken> {
  const res = await request(app)
    .post('/api/proposals/manage/tokens')
    .send({ label: 'Rođaci iz Niša', expires_in_days: 30 })
    .expect(201);
  return res.body as ProposalToken;
}

/** Važeći link upisan direktno u bazu (za testove sa uključenom prijavom). */
function insertLink(db: DB, token = 'tok-123'): string {
  db.prepare('INSERT INTO proposal_tokens (token, label, created_at, expires_at) VALUES (?, ?, ?, ?)').run(
    token,
    'Test',
    new Date().toISOString(),
    future(),
  );
  return token;
}

/** Agent (kolačić) koji je ušao u granu linka. */
async function enterBranch(app: Express, token: string, author = 'Jovan'): Promise<Agent> {
  const agent = request.agent(app);
  await agent.post(`/api/proposals/public/tokens/${token}/enter`).send({ author_name: author }).expect(204);
  return agent;
}

async function review(app: Express, tokenId: number): Promise<BranchChangesResponse> {
  return (await request(app).get(`/api/proposals/manage/tokens/${tokenId}/changes`).expect(200)).body;
}

const merge = (app: Express, tokenId: number, keys: string[]) =>
  request(app).post(`/api/proposals/manage/tokens/${tokenId}/merge`).send({ keys });

const personRow = (db: DB, id: number) =>
  db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Record<string, unknown> | undefined;

const opCount = (db: DB) => (db.prepare('SELECT COUNT(*) AS n FROM proposal_ops').get() as { n: number }).n;

const byName = (persons: PersonSlim[], name: string) => persons.find((p) => p.first_name === name);

describe('pozivni link i ulazak u granu', () => {
  it('rok je obavezan; ime je obavezno; opozvan ili istekao link ne pušta u granu', async () => {
    const { app, db } = testApp();
    await request(app).post('/api/proposals/manage/tokens').send({ label: 'Bez roka' }).expect(400);
    await request(app).post('/api/proposals/manage/tokens').send({ label: 'x', expires_in_days: 45 }).expect(400);

    const link = await createLink(app);
    const info = await request(app).get(`/api/proposals/public/tokens/${link.token}`).expect(200);
    expect(info.body).toEqual({ label: 'Rođaci iz Niša', expires_at: link.expires_at });
    await request(app).post(`/api/proposals/public/tokens/${link.token}/enter`).send({ author_name: ' ' }).expect(400);

    await request(app).delete(`/api/proposals/manage/tokens/${link.id}`).expect(204);
    await request(app).post(`/api/proposals/public/tokens/${link.token}/enter`).send({ author_name: 'Ana' }).expect(404);

    const other = await createLink(app);
    db.prepare('UPDATE proposal_tokens SET expires_at = ? WHERE id = ?').run(new Date(Date.now() - 1000).toISOString(), other.id);
    await request(app).get(`/api/proposals/public/tokens/${other.token}`).expect(404);
  });

  it('opozivanje linka zatvara već otvorenu granu', async () => {
    const { app } = testApp();
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    await agent.get('/api/tree').expect(200);

    await request(app).delete(`/api/proposals/manage/tokens/${link.id}`).expect(204);
    const res = await agent.get('/api/tree').expect(403);
    expect(res.body.error).toBe('branch_closed');
    expect((await agent.get('/api/auth/session')).body.branch).toBeNull();
  });

  it('grana radi bez lozinke, ali ne otvara GEDCOM, kopije ni administraciju', async () => {
    const { app, db } = testApp({ authDisabled: false, authPassword: 'puna' });
    insertPerson(db, { first_name: 'Marko' });
    const token = insertLink(db);

    await request(app).get('/api/tree').expect(401);
    const agent = await enterBranch(app, token, 'Ana');
    expect((await agent.get('/api/tree').expect(200)).body.persons).toHaveLength(1);

    for (const url of ['/api/proposals/manage/tokens', '/api/gedcom/export', '/api/backup/export']) {
      const res = await agent.get(url);
      expect(res.status, url).toBe(403);
      expect(res.body.error, url).toBe('forbidden_branch');
    }

    const session = (await agent.get('/api/auth/session').expect(200)).body;
    expect(session).toMatchObject({ authenticated: false, branch: { label: 'Test', author_name: 'Ana' } });

    await agent.post('/api/auth/exit-branch').expect(204);
    await agent.get('/api/tree').expect(401);
  });

  it('read-only nalog nema pristup pregledu grana', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna', readonlyPassword: 'pregled' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'pregled' }).expect(204);
    await agent.get('/api/proposals/manage/tokens').expect(403);
    await agent.get('/api/proposals/count').expect(403);
  });
});

describe('izmene u grani', () => {
  it('nova osoba, izmena, brak i brisanje vide se samo u grani, a spajanjem ulaze u stablo', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar', last_name: 'Petrović', gender: 'M', birth_date: '1940' });
    const mara = insertPerson(db, { first_name: 'Mara', last_name: 'Petrović', gender: 'F' });
    const stana = insertPerson(db, { first_name: 'Stana', gender: 'F' });
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);

    const luka = (
      await agent.post('/api/persons').send({ first_name: 'Luka', last_name: 'Petrović', gender: 'M', father_id: petar }).expect(201)
    ).body.id as number;
    expect(luka).toBeGreaterThanOrEqual(BRANCH_ID_BASE);
    const patched = await agent.patch(`/api/persons/${petar}`).send({ first_name: 'Petar', birth_place: 'Niš' }).expect(200);
    expect(patched.body.birth_place).toBe('Niš');
    await agent.post('/api/unions').send({ partner1_id: mara, partner2_id: petar, start_date: '1965' }).expect(201);
    await agent.delete(`/api/persons/${stana}`).expect(204);

    // Grana vidi svoje izmene…
    const branchTree = (await agent.get('/api/tree').expect(200)).body;
    expect(byName(branchTree.persons, 'Luka')?.father_id).toBe(petar);
    expect(byName(branchTree.persons, 'Stana')).toBeUndefined();
    expect(byName(branchTree.persons, 'Petar')?.birth_place).toBe('Niš');
    expect(branchTree.unions).toHaveLength(1);

    // …a glavno stablo je netaknuto.
    const mainTree = (await request(app).get('/api/tree').expect(200)).body;
    expect(mainTree.persons).toHaveLength(3);
    expect(mainTree.unions).toHaveLength(0);
    expect(personRow(db, petar)?.birth_place).toBeNull();

    // Ponovljena ista vrednost ne pravi novu operaciju.
    await agent.patch(`/api/persons/${petar}`).send({ birth_place: 'Niš' }).expect(200);
    expect(opCount(db)).toBe(4);

    const { changes } = await review(app, link.id);
    expect(changes.map((c) => [c.key, c.action, c.status])).toEqual([
      [`person:${luka}`, 'create', 'ok'],
      [`person:${petar}`, 'update', 'ok'],
      [expect.stringMatching(/^union:\d+$/), 'create', 'ok'],
      [`person:${stana}`, 'delete', 'ok'],
    ]);
    expect(changes[1]!.fields).toEqual([{ field: 'birth_place', from: null, to: 'Niš', current: null, conflict: false }]);
    expect(changes[0]!.authors).toEqual(['Jovan']);

    const merged = await merge(app, link.id, changes.map((c) => c.key)).expect(200);
    expect(merged.body).toEqual({ merged: 4 });

    const after = (await request(app).get('/api/tree').expect(200)).body;
    expect(byName(after.persons, 'Luka')?.father_id).toBe(petar);
    expect(byName(after.persons, 'Luka')!.id).toBeLessThan(BRANCH_ID_BASE);
    expect(byName(after.persons, 'Stana')).toBeUndefined();
    expect(personRow(db, petar)?.birth_place).toBe('Niš');
    expect(after.unions).toHaveLength(1);
    expect(opCount(db)).toBe(0);
  });

  it('dete nove osobe zavisi od nje; posle spajanja roditelja dete upućuje na novi ID', async () => {
    const { app, db } = testApp();
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    const father = (await agent.post('/api/persons').send({ first_name: 'Miloš', gender: 'M' }).expect(201)).body.id;
    const child = (await agent.post('/api/persons').send({ first_name: 'Ana', gender: 'F', father_id: father }).expect(201)).body.id;

    let { changes } = await review(app, link.id);
    expect(changes.find((c) => c.key === `person:${child}`)?.depends_on).toEqual([`person:${father}`]);

    const missing = await merge(app, link.id, [`person:${child}`]).expect(409);
    expect(missing.body.error).toBe('missing_dependency');

    await merge(app, link.id, [`person:${father}`]).expect(200);
    const milos = db.prepare("SELECT id FROM persons WHERE first_name = 'Miloš'").get() as { id: number };

    ({ changes } = await review(app, link.id));
    expect(changes).toHaveLength(1);
    expect(changes[0]!.fields.find((f) => f.field === 'father_id')?.to).toBe(milos.id);
    expect(changes[0]!.depends_on).toEqual([]);

    await merge(app, link.id, [changes[0]!.key]).expect(200);
    const ana = db.prepare("SELECT father_id FROM persons WHERE first_name = 'Ana'").get() as { father_id: number };
    expect(ana.father_id).toBe(milos.id);
    expect((await review(app, link.id)).changes).toEqual([]);
  });

  it('polje promenjeno u glavnom stablu u međuvremenu je konflikt, ali admin može da ga prihvati', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar', birth_place: 'Beograd' });
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    await agent.patch(`/api/persons/${petar}`).send({ birth_place: 'Niš' }).expect(200);
    db.prepare("UPDATE persons SET birth_place = 'Kragujevac' WHERE id = ?").run(petar);

    const { changes } = await review(app, link.id);
    expect(changes[0]!.status).toBe('conflict');
    expect(changes[0]!.fields).toEqual([
      { field: 'birth_place', from: 'Beograd', to: 'Niš', current: 'Kragujevac', conflict: true },
    ]);

    await merge(app, link.id, [changes[0]!.key]).expect(200);
    expect(personRow(db, petar)?.birth_place).toBe('Niš');
  });

  it('ID koji sada pokazuje na drugu osobu je konflikt', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar', last_name: 'Petrović' });
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    await agent.patch(`/api/persons/${petar}`).send({ notes: 'beleška' }).expect(200);
    db.prepare("UPDATE persons SET first_name = 'Zoran', last_name = 'Ilić' WHERE id = ?").run(petar);

    const { changes } = await review(app, link.id);
    expect(changes[0]!.status).toBe('conflict');
    expect(changes[0]!.problems[0]).toContain('Zoran Ilić');
  });

  it('izmena osobe obrisane u glavnom stablu ne može da se spoji, ali može da se odbaci', async () => {
    const { app, db } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar' });
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    await agent.patch(`/api/persons/${petar}`).send({ notes: 'x' }).expect(200);
    db.prepare('DELETE FROM persons WHERE id = ?').run(petar);

    const { changes } = await review(app, link.id);
    expect(changes[0]!.status).toBe('broken');
    expect((await merge(app, link.id, [changes[0]!.key]).expect(409)).body.error).toBe('change_broken');

    await request(app).post(`/api/proposals/manage/tokens/${link.id}/discard`).send({ keys: [changes[0]!.key] }).expect(204);
    expect(opCount(db)).toBe(0);
  });

  it('odbacivanje izmene od koje zavisi druga traži i zavisnu (i saradnik može da odbacuje)', async () => {
    const { app, db } = testApp();
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    const father = (await agent.post('/api/persons').send({ first_name: 'Miloš', gender: 'M' }).expect(201)).body.id;
    const child = (await agent.post('/api/persons').send({ first_name: 'Ana', father_id: father }).expect(201)).body.id;

    const res = await agent.post('/api/proposals/branch/discard').send({ keys: [`person:${father}`] }).expect(409);
    expect(res.body.error).toBe('dependent_changes');
    await agent.post('/api/proposals/branch/discard').send({ keys: [`person:${father}`, `person:${child}`] }).expect(204);
    expect(opCount(db)).toBe(0);
  });

  it('slika postavljena u grani ulazi u stablo tek spajanjem; odbačena slika se briše', async () => {
    const { app, db, cfg } = testApp();
    const petar = insertPerson(db, { first_name: 'Petar' });
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#888888' } }).png().toBuffer();

    const first = (await agent.post(`/api/persons/${petar}/photo`).attach('photo', png, 'a.png').expect(200)).body.photo_id;
    expect(personRow(db, petar)?.photo_id).toBeNull();
    expect((await agent.get(`/api/persons/${petar}`).expect(200)).body.photo_id).toBe(first);
    await agent.get(`/api/photos/${first}?size=thumb`).expect(200);

    const { changes } = await review(app, link.id);
    expect(changes[0]!.fields).toEqual([{ field: 'photo_id', from: null, to: first, current: null, conflict: false }]);
    await merge(app, link.id, [changes[0]!.key]).expect(200);
    expect(personRow(db, petar)?.photo_id).toBe(first);

    const second = (await agent.post(`/api/persons/${petar}/photo`).attach('photo', png, 'b.png').expect(200)).body.photo_id;
    expect(fs.existsSync(photoFilePath(cfg.dataDir, second, 'full'))).toBe(true);
    await agent.post('/api/proposals/branch/discard').send({ keys: [`person:${petar}`] }).expect(204);
    expect(fs.existsSync(photoFilePath(cfg.dataDir, second, 'full'))).toBe(false);
    expect(fs.existsSync(photoFilePath(cfg.dataDir, first, 'full'))).toBe(true);
  });

  it('više saradnika sa istim linkom radi na istoj grani', async () => {
    const { app } = testApp();
    const link = await createLink(app);
    const ana = await enterBranch(app, link.token, 'Ana');
    const boris = await enterBranch(app, link.token, 'Boris');

    const id = (await ana.post('/api/persons').send({ first_name: 'Luka' }).expect(201)).body.id;
    expect(byName((await boris.get('/api/tree').expect(200)).body.persons, 'Luka')?.id).toBe(id);
    await boris.patch(`/api/persons/${id}`).send({ notes: 'Borisova beleška' }).expect(200);

    const { changes } = await review(app, link.id);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.authors).toEqual(['Ana', 'Boris']);
  });

  it('slanje na odobrenje: broj za pregled i čišćenje posle spajanja', async () => {
    const { app } = testApp();
    const link = await createLink(app);
    const agent = await enterBranch(app, link.token);

    expect((await agent.post('/api/proposals/branch/submit').send({}).expect(409)).body.error).toBe('nothing_to_submit');
    await agent.post('/api/persons').send({ first_name: 'Luka' }).expect(201);
    await agent.post('/api/proposals/branch/submit').send({ note: 'Dodala sam decu' }).expect(204);

    expect((await request(app).get('/api/proposals/count').expect(200)).body.count).toBe(1);
    const token = (await request(app).get(`/api/proposals/manage/tokens/${link.id}`).expect(200)).body as ProposalToken;
    expect(token).toMatchObject({ change_count: 1, submitted_by: 'Jovan', submit_note: 'Dodala sam decu' });
    expect((await agent.get('/api/proposals/branch/changes').expect(200)).body.changes).toHaveLength(1);
    expect((await agent.get('/api/auth/session')).body.branch.submitted_at).toBeTruthy();

    const { changes } = await review(app, link.id);
    await merge(app, link.id, changes.map((c) => c.key)).expect(200);
    expect((await request(app).get('/api/proposals/count')).body.count).toBe(0);
    expect((await request(app).get(`/api/proposals/manage/tokens/${link.id}`)).body.submitted_at).toBeNull();
  });
});
