import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { insertPerson, testApp } from './testHelpers';

describe('GET /api/tree', () => {
  it('prazna baza → prazni nizovi', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ persons: [], unions: [] });
  });

  it('vraća PersonSlim oblik (bez notes/created_at) i sve unions', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, {
      first_name: 'Đorđe',
      last_name: 'Đorđević',
      gender: 'M',
      birth_date: '1950',
      notes: 'tajna beleška',
    });
    const b = insertPerson(db, { first_name: 'Milica', gender: 'F', maiden_name: 'Šarić' });
    await request(app).post('/api/unions').send({ partner1_id: a, partner2_id: b, start_date: '1975-06-01' });

    const res = await request(app).get('/api/tree');
    expect(res.status).toBe(200);
    expect(res.body.persons).toHaveLength(2);
    expect(res.body.unions).toHaveLength(1);

    const slim = res.body.persons[0];
    expect(Object.keys(slim).sort()).toEqual(
      [
        'id', 'first_name', 'last_name', 'maiden_name', 'gender', 'title',
        'birth_date', 'death_date', 'photo_id', 'father_id', 'mother_id', 'is_family_head',
      ].sort(),
    );
    expect(slim).not.toHaveProperty('notes');
    expect(slim.is_family_head).toBe(false); // 0/1 u bazi → boolean u DTO

    const union = res.body.unions[0];
    expect(union).toMatchObject({ partner1_id: a, partner2_id: b, type: 'marriage', start_date: '1975-06-01' });
  });

  it('vraća ETag i odgovara 304 na If-None-Match (uslovni GET štedi protok)', async () => {
    const { app, db } = testApp();
    insertPerson(db, { first_name: 'Ana', gender: 'F' });

    const first = await request(app).get('/api/tree');
    expect(first.status).toBe(200);
    const etag = first.headers.etag as string | undefined;
    expect(etag).toBeTruthy();

    const second = await request(app).get('/api/tree').set('If-None-Match', etag ?? '');
    expect(second.status).toBe(304);
    expect(second.text).toBe('');
  });

  it('ETag se menja kad se stablo izmeni', async () => {
    const { app, db } = testApp();
    insertPerson(db, { first_name: 'Ana', gender: 'F' });
    const before = (await request(app).get('/api/tree')).headers.etag;

    insertPerson(db, { first_name: 'Bran', gender: 'M' });
    const after = (await request(app).get('/api/tree')).headers.etag;

    expect(after).not.toBe(before);
  });

  it('PATCH is_family_head → tree vraća boolean true (koercija 0/1 ↔ boolean)', async () => {
    const { app, db } = testApp();
    const id = insertPerson(db, { first_name: 'Đorđe', gender: 'M' });

    const patched = await request(app).patch(`/api/persons/${id}`).send({ is_family_head: true });
    expect(patched.status).toBe(200);
    expect(patched.body.is_family_head).toBe(true);

    const res = await request(app).get('/api/tree');
    expect(res.body.persons.find((p: { id: number }) => p.id === id).is_family_head).toBe(true);
  });
});
