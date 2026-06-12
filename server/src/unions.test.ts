import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { insertPerson, testApp } from './testHelpers';

describe('unions', () => {
  it('POST kanonizuje redosled partnera (partner1_id < partner2_id)', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana', gender: 'F' });
    const b = insertPerson(db, { first_name: 'Boris', gender: 'M' });
    expect(b).toBeGreaterThan(a);

    const res = await request(app).post('/api/unions').send({ partner1_id: b, partner2_id: a, start_date: '2000-05-20' });
    expect(res.status).toBe(201);
    expect(res.body.partner1_id).toBe(a);
    expect(res.body.partner2_id).toBe(b);
    expect(res.body.type).toBe('marriage');
  });

  it('duplikat istog para sa istim start_date → 409 duplicate_union', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana' });
    const b = insertPerson(db, { first_name: 'Boris' });

    const prvi = await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: b, start_date: '2000-05-20' });
    expect(prvi.status).toBe(201);

    const dup = await request(app).post('/api/unions').send({ partner1_id: b, partner2_id: a, start_date: '2000-05-20' });
    expect(dup.status).toBe(409);
    expect(dup.body.error).toBe('duplicate_union');

    // isti par, drugi datum — dozvoljeno (ponovni brak)
    const ponovni = await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: b, start_date: '2010-09-09' });
    expect(ponovni.status).toBe(201);
  });

  it('nepostojeći partner → 422 invalid_partner', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana' });
    const res = await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: 9999 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_partner');
  });

  it('ista osoba kao oba partnera → 400 validation', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana' });
    const res = await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: a });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
  });

  it('PATCH menja end_date/end_reason, partneri ostaju', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana' });
    const b = insertPerson(db, { first_name: 'Boris' });
    const created = await request(app)
      .post('/api/unions')
      .send({ partner1_id: a, partner2_id: b, type: 'partnership', start_date: '1990' });

    const res = await request(app)
      .patch(`/api/unions/${created.body.id}`)
      .send({ end_date: '1999-12-31', end_reason: 'divorce' });
    expect(res.status).toBe(200);
    expect(res.body.end_date).toBe('1999-12-31');
    expect(res.body.end_reason).toBe('divorce');
    expect(res.body.start_date).toBe('1990'); // nedirnuto
    expect(res.body.type).toBe('partnership'); // nedostajući ključ se ne dira (default iz šeme ne sme da pregazi)
    expect(res.body.partner1_id).toBe(a);
  });

  it('DELETE → 204; nepostojeći → 404', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'Ana' });
    const b = insertPerson(db, { first_name: 'Boris' });
    const created = await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: b });

    const del = await request(app).delete(`/api/unions/${created.body.id}`);
    expect(del.status).toBe(204);

    const again = await request(app).delete(`/api/unions/${created.body.id}`);
    expect(again.status).toBe(404);
  });
});
