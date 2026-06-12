import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { insertPerson, testApp } from './testHelpers';

// GEDCOM module piše paralelni agent — testovi se preskaču dok import.ts/export.ts ne postoje.
const gedcomDir = path.join(import.meta.dirname, 'gedcom');
const gedcomReady = fs.existsSync(path.join(gedcomDir, 'import.ts')) && fs.existsSync(path.join(gedcomDir, 'export.ts'));

describe.skipIf(!gedcomReady)('GEDCOM rute', () => {
  function seedFamily(db: import('better-sqlite3').Database) {
    const otac = insertPerson(db, { first_name: 'Đorđe', last_name: 'Đorđević', gender: 'M', birth_date: '1950-01-15' });
    const majka = insertPerson(db, { first_name: 'Šana', last_name: 'Đorđević', maiden_name: 'Ćirić', gender: 'F', birth_date: '1953' });
    const dete = insertPerson(db, { first_name: 'Čedomir', last_name: 'Đorđević', gender: 'M', birth_date: '1980-06-01', father_id: otac, mother_id: majka });
    db.prepare('INSERT INTO unions (partner1_id, partner2_id, type, start_date) VALUES (?, ?, ?, ?)').run(
      Math.min(otac, majka), Math.max(otac, majka), 'marriage', '1975-06-01',
    );
    return { otac, majka, dete };
  }

  it('export vraća .ged sa ispravnim headerima i ŠĐČĆŽ imenima', async () => {
    const { app, db } = testApp();
    seedFamily(db);

    const res = await request(app).get('/api/gedcom/export');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/gedcom');
    expect(res.headers['content-disposition']).toContain('porodicno-stablo.ged');
    expect(res.text).toContain('0 HEAD');
    expect(res.text).toContain('Đorđević');
  });

  it('round-trip: export pa import mode=replace u praznu bazu', async () => {
    const izvor = testApp();
    seedFamily(izvor.db);
    const exported = await request(izvor.app).get('/api/gedcom/export');

    const cilj = testApp();
    const res = await request(cilj.app)
      .post('/api/gedcom/import?mode=replace')
      .attach('file', Buffer.from(exported.text, 'utf-8'), 'stablo.ged');
    expect(res.status).toBe(200);
    expect(res.body.dry_run).toBe(false);
    expect(res.body.persons_created).toBe(3);
    expect(res.body.unions_created).toBe(1);

    const tree = await request(cilj.app).get('/api/tree');
    expect(tree.body.persons).toHaveLength(3);
    expect(tree.body.unions).toHaveLength(1);
    const cedomir = tree.body.persons.find((p: { first_name: string }) => p.first_name === 'Čedomir');
    expect(cedomir.father_id).not.toBeNull();
    expect(cedomir.mother_id).not.toBeNull();
  });

  it('dry_run=1 vraća rezultat ali ne menja bazu', async () => {
    const izvor = testApp();
    seedFamily(izvor.db);
    const exported = await request(izvor.app).get('/api/gedcom/export');

    const cilj = testApp();
    const res = await request(cilj.app)
      .post('/api/gedcom/import?mode=replace&dry_run=1')
      .attach('file', Buffer.from(exported.text, 'utf-8'), 'stablo.ged');
    expect(res.status).toBe(200);
    expect(res.body.dry_run).toBe(true);
    expect(res.body.persons_created).toBe(3);

    const tree = await request(cilj.app).get('/api/tree');
    expect(tree.body.persons).toHaveLength(0);
  });

  it('merge preskače osobe sa postojećim gedcom_xref (matched)', async () => {
    const izvor = testApp();
    seedFamily(izvor.db);
    const exported = await request(izvor.app).get('/api/gedcom/export');

    const cilj = testApp();
    const prvi = await request(cilj.app)
      .post('/api/gedcom/import?mode=merge')
      .attach('file', Buffer.from(exported.text, 'utf-8'), 'stablo.ged');
    expect(prvi.body.persons_created).toBe(3);
    expect(prvi.body.matched).toBe(0);

    const drugi = await request(cilj.app)
      .post('/api/gedcom/import?mode=merge')
      .attach('file', Buffer.from(exported.text, 'utf-8'), 'stablo.ged');
    expect(drugi.body.persons_created).toBe(0);
    expect(drugi.body.matched).toBe(3);

    const tree = await request(cilj.app).get('/api/tree');
    expect(tree.body.persons).toHaveLength(3);
  });

  it('neispravan mode → 400; bez fajla → 400', async () => {
    const { app } = testApp();
    const losMode = await request(app)
      .post('/api/gedcom/import?mode=nesto')
      .attach('file', Buffer.from('0 HEAD\n0 TRLR\n'), 'x.ged');
    expect(losMode.status).toBe(400);

    const bezFajla = await request(app).post('/api/gedcom/import?mode=replace');
    expect(bezFajla.status).toBe(400);
  });
});
