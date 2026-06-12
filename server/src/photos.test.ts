import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import request from 'supertest';
import sharp from 'sharp';
import { insertPerson, testApp, type TestApp } from './testHelpers';

async function jpegBuffer(): Promise<Buffer> {
  return sharp({
    create: { width: 64, height: 48, channels: 3, background: { r: 180, g: 90, b: 40 } },
  })
    .jpeg()
    .toBuffer();
}

function photoPaths(t: TestApp, photoId: string): { full: string; thumb: string } {
  const dir = path.join(t.cfg.dataDir, 'photos');
  return { full: path.join(dir, `${photoId}.webp`), thumb: path.join(dir, `${photoId}.thumb.webp`) };
}

describe('photos', () => {
  it('upload JPEG → 200 {photo_id}, oba webp fajla postoje, photo_id upisan', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });

    const res = await request(t.app)
      .post(`/api/persons/${id}/photo`)
      .attach('photo', await jpegBuffer(), 'slika.jpg');
    expect(res.status).toBe(200);
    const photoId = res.body.photo_id as string;
    expect(photoId).toMatch(/^[0-9a-f-]{36}$/);

    const { full, thumb } = photoPaths(t, photoId);
    expect(fs.existsSync(full)).toBe(true);
    expect(fs.existsSync(thumb)).toBe(true);

    const meta = await sharp(fs.readFileSync(thumb)).metadata();
    expect(meta.format).toBe('webp');
    expect(meta.width).toBe(320);
    expect(meta.height).toBe(320);

    const person = await request(t.app).get(`/api/persons/${id}`);
    expect(person.body.photo_id).toBe(photoId);
  });

  it('zamena slike pravi novi UUID i briše stare fajlove', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const buf = await jpegBuffer();

    const prvi = await request(t.app).post(`/api/persons/${id}/photo`).attach('photo', buf, 'a.jpg');
    const stari = prvi.body.photo_id as string;
    const drugi = await request(t.app).post(`/api/persons/${id}/photo`).attach('photo', buf, 'b.jpg');
    const novi = drugi.body.photo_id as string;

    expect(novi).not.toBe(stari);
    expect(fs.existsSync(photoPaths(t, stari).full)).toBe(false);
    expect(fs.existsSync(photoPaths(t, stari).thumb)).toBe(false);
    expect(fs.existsSync(photoPaths(t, novi).full)).toBe(true);
  });

  it('ne-slika → 400 invalid_image', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const res = await request(t.app)
      .post(`/api/persons/${id}/photo`)
      .attach('photo', Buffer.from('ovo nije slika nego tekst'), 'fajl.txt');
    expect(res.status).toBe(400);
    expect(res.body.error).toBe('invalid_image');
  });

  it('upload bez fajla → 400; nepostojeća osoba → 404', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const bez = await request(t.app).post(`/api/persons/${id}/photo`);
    expect(bez.status).toBe(400);

    const nema = await request(t.app).post('/api/persons/9999/photo').attach('photo', await jpegBuffer(), 'x.jpg');
    expect(nema.status).toBe(404);
  });

  it('GET /api/photos/:uuid služi webp uz immutable keš; thumb preko ?size=thumb', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const up = await request(t.app).post(`/api/persons/${id}/photo`).attach('photo', await jpegBuffer(), 'x.jpg');
    const photoId = up.body.photo_id as string;

    const full = await request(t.app).get(`/api/photos/${photoId}`);
    expect(full.status).toBe(200);
    expect(full.headers['content-type']).toContain('image/webp');
    expect(full.headers['cache-control']).toBe('private, max-age=31536000, immutable');

    const thumb = await request(t.app).get(`/api/photos/${photoId}?size=thumb`);
    expect(thumb.status).toBe(200);

    const los = await request(t.app).get(`/api/photos/${photoId}?size=ogromna`);
    expect(los.status).toBe(400);
  });

  it('GET sa ne-UUID parametrom (path traversal) → 400; nepostojeći UUID → 404', async () => {
    const t = testApp();
    const traversal = await request(t.app).get('/api/photos/..%2F..%2Ffamilytree.db');
    expect(traversal.status).toBe(400);

    const nema = await request(t.app).get('/api/photos/00000000-0000-4000-8000-000000000000');
    expect(nema.status).toBe(404);
  });

  it('DELETE photo briše fajlove i postavlja photo_id na NULL', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const up = await request(t.app).post(`/api/persons/${id}/photo`).attach('photo', await jpegBuffer(), 'x.jpg');
    const photoId = up.body.photo_id as string;

    const del = await request(t.app).delete(`/api/persons/${id}/photo`);
    expect(del.status).toBe(204);
    expect(fs.existsSync(photoPaths(t, photoId).full)).toBe(false);
    expect(fs.existsSync(photoPaths(t, photoId).thumb)).toBe(false);

    const person = await request(t.app).get(`/api/persons/${id}`);
    expect(person.body.photo_id).toBeNull();
  });

  it('DELETE osobe briše i njene fajlove slika', async () => {
    const t = testApp();
    const id = insertPerson(t.db, { first_name: 'Đurđa' });
    const up = await request(t.app).post(`/api/persons/${id}/photo`).attach('photo', await jpegBuffer(), 'x.jpg');
    const photoId = up.body.photo_id as string;

    await request(t.app).delete(`/api/persons/${id}`);
    expect(fs.existsSync(photoPaths(t, photoId).full)).toBe(false);
    expect(fs.existsSync(photoPaths(t, photoId).thumb)).toBe(false);
  });
});
