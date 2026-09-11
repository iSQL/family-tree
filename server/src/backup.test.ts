import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Buffer } from 'node:buffer';
import request from 'supertest';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { openDb } from './db';
import { buildBackupZip, restoreBackupZip } from './services/fullBackup';
import { photosDir } from './services/photoService';
import { testApp } from './testHelpers';

function tmpDataDir(): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ft-bkp-'));
  fs.mkdirSync(path.join(dir, 'photos'), { recursive: true });
  return dir;
}

function writePhoto(dataDir: string, name: string, content: string): void {
  fs.writeFileSync(path.join(photosDir(dataDir), name), Buffer.from(content));
}

/** supertest binarni parser — skuplja telo u Buffer (za ZIP odgovor). */
const binaryParser = (
  res: { setEncoding(e: string): void; on(ev: string, cb: (chunk: string) => void): void },
  cb: (err: Error | null, body: Buffer) => void,
): void => {
  res.setEncoding('binary');
  let data = '';
  res.on('data', (chunk: string) => { data += chunk; });
  res.on('end', () => cb(null, Buffer.from(data, 'binary')));
};

describe('fullBackup — round-trip (servis)', () => {
  it('izvoz pa vraćanje čuva osobe, brakove, roditeljske FK i interna polja', () => {
    const db = openDb(':memory:');
    const dataDir = tmpDataDir();

    // A i B su par (glava porodice A), C je njihovo dete.
    db.exec(`
      INSERT INTO persons (id, first_name, last_name, gender, title, birth_place, notes, photo_id, is_family_head)
        VALUES (1, 'Ana', 'Anić', 'F', 'dr', 'Niš', 'beleška', 'foto-a', 1);
      INSERT INTO persons (id, first_name, last_name, gender) VALUES (2, 'Bora', 'Anić', 'M');
      INSERT INTO persons (id, first_name, last_name, gender, father_id, mother_id)
        VALUES (3, 'Cveta', 'Anić', 'F', 2, 1);
      INSERT INTO unions (id, partner1_id, partner2_id, type, start_date) VALUES (1, 1, 2, 'marriage', '1990');
    `);
    writePhoto(dataDir, 'foto-a.webp', 'PUNA-SLIKA');
    writePhoto(dataDir, 'foto-a.thumb.webp', 'THUMB-SLIKA');

    const zip = buildBackupZip(db, dataDir);
    const entries = unzipSync(zip);
    expect(Object.keys(entries)).toEqual(
      expect.arrayContaining(['backup.json', 'photos/foto-a.webp', 'photos/foto-a.thumb.webp']),
    );

    // Zaprljaj stanje: dodaj vanrednu osobu i stray sliku — vraćanje mora da ih izbriše.
    db.exec("INSERT INTO persons (id, first_name, gender) VALUES (99, 'Visak', 'U');");
    writePhoto(dataDir, 'stray.webp', 'x');

    const result = restoreBackupZip(db, dataDir, Buffer.from(zip));
    expect(result).toEqual({ persons: 3, unions: 1, photos: 2 });

    const persons = db.prepare('SELECT id, first_name, title, photo_id, is_family_head, father_id, mother_id FROM persons ORDER BY id').all() as Array<Record<string, unknown>>;
    expect(persons.map((p) => p.id)).toEqual([1, 2, 3]); // višak obrisan, id-jevi očuvani
    expect(persons[0]).toMatchObject({ title: 'dr', photo_id: 'foto-a', is_family_head: 1 });
    expect(persons[2]).toMatchObject({ father_id: 2, mother_id: 1 }); // FK preživeo dvoprolazno ubacivanje

    const unions = db.prepare('SELECT partner1_id, partner2_id, start_date FROM unions').all();
    expect(unions).toEqual([{ partner1_id: 1, partner2_id: 2, start_date: '1990' }]);

    // Slike: originali vraćeni, stray uklonjen.
    expect(fs.existsSync(path.join(photosDir(dataDir), 'foto-a.webp'))).toBe(true);
    expect(fs.readFileSync(path.join(photosDir(dataDir), 'foto-a.thumb.webp'), 'utf8')).toBe('THUMB-SLIKA');
    expect(fs.existsSync(path.join(photosDir(dataDir), 'stray.webp'))).toBe(false);
  });

  it('čuva pozivne linkove i grane predloga; starija kopija bez njih ostavlja postojeće', () => {
    const db = openDb(':memory:');
    const dataDir = tmpDataDir();
    db.exec(`
      INSERT INTO proposal_tokens (id, token, label, created_at, expires_at, next_local_id, submitted_by)
        VALUES (1, 'tok', 'Rođaci', '2026-01-01T00:00:00.000Z', '2099-01-01T00:00:00.000Z', 3, 'Ana');
      INSERT INTO proposal_ops (id, token_id, entity, entity_id, action, payload, author, created_at)
        VALUES (1, 1, 'person', 1000000001, 'create', '{"input":{"first_name":"Luka"}}', 'Ana', '2026-01-02T00:00:00.000Z');
    `);
    const zip = buildBackupZip(db, dataDir);

    db.exec('DELETE FROM proposal_ops; DELETE FROM proposal_tokens;');
    restoreBackupZip(db, dataDir, Buffer.from(zip));
    expect(db.prepare('SELECT token, next_local_id, submitted_by FROM proposal_tokens').all()).toEqual([
      { token: 'tok', next_local_id: 3, submitted_by: 'Ana' },
    ]);
    expect(db.prepare('SELECT entity_id, author FROM proposal_ops').all()).toEqual([
      { entity_id: 1000000001, author: 'Ana' },
    ]);

    // Kopija iz vremena pre predloga (bez polja proposal_tokens/proposal_ops).
    const entries = unzipSync(zip);
    const manifest = JSON.parse(strFromU8(entries['backup.json']!)) as Record<string, unknown>;
    delete manifest.proposal_tokens;
    delete manifest.proposal_ops;
    const oldZip = zipSync({ ...entries, 'backup.json': strToU8(JSON.stringify(manifest)) });
    restoreBackupZip(db, dataDir, Buffer.from(oldZip));
    expect(db.prepare('SELECT COUNT(*) AS n FROM proposal_ops').get()).toEqual({ n: 1 });
  });

  it('odbija ZIP bez backup.json', () => {
    const db = openDb(':memory:');
    const dataDir = tmpDataDir();
    const notABackup = Buffer.from('nije zip');
    expect(() => restoreBackupZip(db, dataDir, notABackup)).toThrow();
  });
});

describe('backup rute — pristup', () => {
  it('authDisabled: izvoz vraća ZIP, pa vraćanje tog ZIP-a uspeva', async () => {
    const { app, db } = testApp();
    db.exec("INSERT INTO persons (first_name, gender) VALUES ('Test', 'M');");

    const exp = await request(app).get('/api/backup/export').buffer(true).parse(binaryParser);
    expect(exp.status).toBe(200);
    expect(exp.headers['content-type']).toContain('application/zip');
    expect(exp.body.subarray(0, 2).toString()).toBe('PK'); // ZIP magic

    const res = await request(app).post('/api/backup/restore').attach('file', exp.body, 'backup.zip');
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ persons: 1, unions: 0, photos: 0 });
  });

  it('read-only sesija: izvoz i vraćanje → 403 forbidden_admin', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna', readonlyPassword: 'pregled' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'pregled' });

    const exp = await agent.get('/api/backup/export');
    expect(exp.status).toBe(403);
    expect(exp.body.error).toBe('forbidden_admin');

    const restore = await agent.post('/api/backup/restore').attach('file', Buffer.from('x'), 'b.zip');
    expect(restore.status).toBe(403);
  });

  it('neprijavljen (auth uključen): izvoz → 401', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna' });
    const res = await request(app).get('/api/backup/export');
    expect(res.status).toBe(401);
  });

  it('puna lozinka: izvoz → 200', async () => {
    const { app } = testApp({ authDisabled: false, authPassword: 'puna' });
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ password: 'puna' });
    const exp = await agent.get('/api/backup/export').buffer(true).parse(binaryParser);
    expect(exp.status).toBe(200);
  });
});
