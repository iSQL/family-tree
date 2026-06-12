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
        'birth_date', 'death_date', 'photo_id', 'father_id', 'mother_id',
      ].sort(),
    );
    expect(slim).not.toHaveProperty('notes');

    const union = res.body.unions[0];
    expect(union).toMatchObject({ partner1_id: a, partner2_id: b, type: 'marriage', start_date: '1975-06-01' });
  });
});
