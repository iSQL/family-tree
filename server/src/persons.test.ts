import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { insertPerson, testApp } from './testHelpers';

describe('persons CRUD', () => {
  it('POST → 201, GET vraća detalje', async () => {
    const { app } = testApp();
    const created = await request(app).post('/api/persons').send({
      first_name: 'Đorđe',
      last_name: 'Đorđević',
      gender: 'M',
      title: 'dr',
      birth_date: '1950-01-15',
      birth_place: 'Niš',
    });
    expect(created.status).toBe(201);
    expect(created.body.first_name).toBe('Đorđe');
    expect(created.body.last_name).toBe('Đorđević');

    const res = await request(app).get(`/api/persons/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({
      first_name: 'Đorđe',
      title: 'dr',
      birth_date: '1950-01-15',
      father: null,
      mother: null,
      siblings: [],
      unions: [],
      children: [],
    });
  });

  it('POST bez imena → 400 validation sa issues', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/persons').send({ last_name: 'Đorđević' });
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('validation');
    expect(res.body.issues).toBeTruthy();
  });

  it('POST sa neispravnim datumom → 400', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/persons').send({ first_name: 'Ana', birth_date: '1990-13-45' });
    expect(res.status).toBe(400);
  });

  it('POST sa nepostojećim roditeljem → 422 invalid_parent', async () => {
    const { app } = testApp();
    const res = await request(app).post('/api/persons').send({ first_name: 'Ana', father_id: 9999 });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('invalid_parent');
  });

  it('GET nepostojeće osobe → 404', async () => {
    const { app } = testApp();
    const res = await request(app).get('/api/persons/424242');
    expect(res.status).toBe(404);
    expect(res.body.error).toBe('not_found');
  });

  it('PATCH menja samo poslate ključeve', async () => {
    const { app, db } = testApp();
    const id = insertPerson(db, {
      first_name: 'Milan',
      last_name: 'Đorđević',
      notes: 'važna beleška',
      birth_place: 'Niš',
      birth_date: '1960',
    });
    const res = await request(app).patch(`/api/persons/${id}`).send({ first_name: 'Milovan', birth_place: null });
    expect(res.status).toBe(200);
    expect(res.body.first_name).toBe('Milovan');
    expect(res.body.birth_place).toBeNull(); // eksplicitni null briše
    expect(res.body.notes).toBe('važna beleška'); // nedostajući ključ se ne dira
    expect(res.body.last_name).toBe('Đorđević');
    expect(res.body.birth_date).toBe('1960');
  });

  it('PATCH self-parent → 422 cycle', async () => {
    const { app, db } = testApp();
    const id = insertPerson(db, { first_name: 'Petar' });
    const res = await request(app).patch(`/api/persons/${id}`).send({ father_id: id });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('cycle');
  });

  it('PATCH ciklus kroz potomke → 422 cycle (A→B→C, pa C kao roditelj A)', async () => {
    const { app, db } = testApp();
    const a = insertPerson(db, { first_name: 'A' });
    const b = insertPerson(db, { first_name: 'B', father_id: a });
    const c = insertPerson(db, { first_name: 'C', father_id: b });
    const res = await request(app).patch(`/api/persons/${a}`).send({ father_id: c });
    expect(res.status).toBe(422);
    expect(res.body.error).toBe('cycle');
  });

  it('DELETE → 204; deci se roditeljski FK postavlja na NULL', async () => {
    const { app, db } = testApp();
    const otac = insertPerson(db, { first_name: 'Otac', gender: 'M' });
    const dete = insertPerson(db, { first_name: 'Dete', father_id: otac });

    const del = await request(app).delete(`/api/persons/${otac}`);
    expect(del.status).toBe(204);

    const gone = await request(app).get(`/api/persons/${otac}`);
    expect(gone.status).toBe(404);

    const child = await request(app).get(`/api/persons/${dete}`);
    expect(child.body.father_id).toBeNull();
  });

  it('DELETE nepostojeće osobe → 404', async () => {
    const { app } = testApp();
    const res = await request(app).delete('/api/persons/9999');
    expect(res.status).toBe(404);
  });
});

describe('PersonDetail — srodnici', () => {
  it('siblings sa half oznakom: rođeni, po ocu, po majci; sortirani po birth_date', async () => {
    const { app, db } = testApp();
    const otac = insertPerson(db, { first_name: 'Otac', gender: 'M' });
    const majka = insertPerson(db, { first_name: 'Majka', gender: 'F' });
    const drugaMajka = insertPerson(db, { first_name: 'Maćeha', gender: 'F' });
    const drugiOtac = insertPerson(db, { first_name: 'Očuh', gender: 'M' });

    const ja = insertPerson(db, { first_name: 'Ja', father_id: otac, mother_id: majka, birth_date: '1990-05-05' });
    const rodjeni = insertPerson(db, { first_name: 'Rođeni', father_id: otac, mother_id: majka, birth_date: '1992-01-01' });
    const poOcu = insertPerson(db, { first_name: 'PoOcu', father_id: otac, mother_id: drugaMajka, birth_date: '1985-01-01' });
    const poMajci = insertPerson(db, { first_name: 'PoMajci', father_id: drugiOtac, mother_id: majka, birth_date: '1995-01-01' });

    const res = await request(app).get(`/api/persons/${ja}`);
    expect(res.status).toBe(200);
    const siblings = res.body.siblings as { id: number; half: false | 'paternal' | 'maternal' }[];
    // sortirano po birth_date: 1985 (poOcu), 1992 (rodjeni), 1995 (poMajci); bez tražene osobe
    expect(siblings.map((s) => s.id)).toEqual([poOcu, rodjeni, poMajci]);
    expect(siblings.find((s) => s.id === rodjeni)?.half).toBe(false);
    expect(siblings.find((s) => s.id === poOcu)?.half).toBe('paternal');
    expect(siblings.find((s) => s.id === poMajci)?.half).toBe('maternal');
    expect(siblings.some((s) => s.id === ja)).toBe(false);
  });

  it('father/mother/children/unions sa partnerom', async () => {
    const { app, db } = testApp();
    const otac = insertPerson(db, { first_name: 'Otac', gender: 'M' });
    const majka = insertPerson(db, { first_name: 'Majka', gender: 'F' });
    const dete1 = insertPerson(db, { first_name: 'Prvo', father_id: otac, mother_id: majka, birth_date: '1980' });
    const dete2 = insertPerson(db, { first_name: 'Drugo', father_id: otac, mother_id: majka, birth_date: '1978' });
    await request(app).post('/api/unions').send({ partner1_id: otac, partner2_id: majka, start_date: '1975-06-01' });

    const res = await request(app).get(`/api/persons/${otac}`);
    expect(res.body.father).toBeNull();
    expect(res.body.children.map((c: { id: number }) => c.id)).toEqual([dete2, dete1]); // po birth_date
    expect(res.body.unions).toHaveLength(1);
    expect(res.body.unions[0].partner.id).toBe(majka);

    const child = await request(app).get(`/api/persons/${dete1}`);
    expect(child.body.father.id).toBe(otac);
    expect(child.body.mother.id).toBe(majka);
  });
});
