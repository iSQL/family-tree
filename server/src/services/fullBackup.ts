/**
 * Potpuna rezervna kopija — ZIP koji sadrži CELU bazu (persons + unions, svi redovi
 * i sve kolone) i SVE fajlove slika. Za razliku od GEDCOM-a (prenosivi standard, bez
 * slika i internih polja), ovo je tačan, bezgubitni snimak spreman za vraćanje.
 *
 * Sadržaj ZIP-a:
 *   backup.json   — { format, app_version, schema_version, created_at, persons[], unions[] }
 *   photos/<ime>  — svi fajlovi iz data/photos (…​.webp i …​.thumb.webp)
 *
 * Samo admin (puna lozinka) sme da pravi i vraća kopiju — vraćanje briše sve postojeće.
 */
import fs from 'node:fs';
import path from 'node:path';
import { zipSync, unzipSync, strToU8, strFromU8 } from 'fflate';
import { z } from 'zod';
import type { DB } from '../db';
import type { BackupRestoreResult, Person, Union } from '@shared/types';
import { photosDir } from './photoService';
import { AppError } from '../middleware/errors';

const FORMAT = 'family-tree-backup';
const APP_VERSION = 1;

/** Kolone se dump-uju/vraćaju eksplicitno — nove kolone se dodaju ovde uz migraciju. */
const PERSON_COLS = [
  'id', 'first_name', 'last_name', 'maiden_name', 'gender', 'title',
  'birth_date', 'death_date', 'birth_place', 'notes', 'photo_id',
  'father_id', 'mother_id', 'gedcom_xref', 'is_family_head', 'created_at', 'updated_at',
] as const;
const UNION_COLS = [
  'id', 'partner1_id', 'partner2_id', 'type', 'start_date', 'end_date', 'end_reason', 'notes',
] as const;

/** Ime fajla u ZIP-u ne sme da izađe iz photos/ (zaštita od path traversal-a). */
function safePhotoName(name: string): string | null {
  const base = name.slice('photos/'.length);
  if (base === '' || base.includes('/') || base.includes('\\') || base.includes('..')) return null;
  return base;
}

export function schemaVersion(db: DB): number {
  return db.pragma('user_version', { simple: true }) as number;
}

/** Napravi ZIP potpune kopije (sinhrono — retka, namerna admin radnja). */
export function buildBackupZip(db: DB, dataDir: string): Uint8Array {
  const persons = db.prepare(`SELECT ${PERSON_COLS.join(', ')} FROM persons ORDER BY id`).all() as Person[];
  const unions = db.prepare(`SELECT ${UNION_COLS.join(', ')} FROM unions ORDER BY id`).all() as Union[];

  const manifest = {
    format: FORMAT,
    app_version: APP_VERSION,
    schema_version: schemaVersion(db),
    created_at: new Date().toISOString(),
    persons,
    unions,
  };

  const files: Record<string, Uint8Array> = {
    'backup.json': strToU8(JSON.stringify(manifest)),
  };

  const dir = photosDir(dataDir);
  if (fs.existsSync(dir)) {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isFile()) files[`photos/${name}`] = fs.readFileSync(full);
    }
  }

  // Slike (webp) su već kompresovane, a JSON dump je mali → čuvanje bez kompresije
  // (level 0) je brzo i sasvim dovoljno za rezervnu kopiju ove veličine.
  return zipSync(files, { level: 0 });
}

const personSchema = z.object({
  id: z.number().int(),
  first_name: z.string(),
  last_name: z.string(),
  maiden_name: z.string().nullable(),
  gender: z.enum(['M', 'F', 'U']),
  title: z.string().nullable(),
  birth_date: z.string().nullable(),
  death_date: z.string().nullable(),
  birth_place: z.string().nullable(),
  notes: z.string().nullable(),
  photo_id: z.string().nullable(),
  father_id: z.number().int().nullable(),
  mother_id: z.number().int().nullable(),
  gedcom_xref: z.string().nullable(),
  is_family_head: z.number().int(),
  created_at: z.string(),
  updated_at: z.string(),
});
const unionSchema = z.object({
  id: z.number().int(),
  partner1_id: z.number().int(),
  partner2_id: z.number().int(),
  type: z.enum(['marriage', 'partnership']),
  start_date: z.string().nullable(),
  end_date: z.string().nullable(),
  end_reason: z.enum(['divorce', 'death', 'separation']).nullable(),
  notes: z.string().nullable(),
});
const manifestSchema = z.object({
  format: z.literal(FORMAT),
  schema_version: z.number().int(),
  persons: z.array(personSchema),
  unions: z.array(unionSchema),
});

/**
 * Vrati bazu i slike iz ZIP-a. BRIŠE sve postojeće. Transakcija za bazu (dvoprolazno
 * ubacivanje da roditeljski FK ne padne), pa tek onda zamena foldera slika.
 */
export function restoreBackupZip(db: DB, dataDir: string, zipBuffer: Buffer): BackupRestoreResult {
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(zipBuffer);
  } catch {
    throw new AppError(400, 'invalid_backup', 'Fajl nije važeća ZIP rezervna kopija');
  }

  const manifestRaw = entries['backup.json'];
  if (!manifestRaw) throw new AppError(400, 'invalid_backup', 'Nedostaje backup.json u arhivi');

  let manifest: z.infer<typeof manifestSchema>;
  try {
    manifest = manifestSchema.parse(JSON.parse(strFromU8(manifestRaw)));
  } catch {
    throw new AppError(400, 'invalid_backup', 'backup.json nije u očekivanom formatu');
  }

  if (manifest.schema_version > schemaVersion(db)) {
    throw new AppError(
      400,
      'incompatible_backup',
      'Rezervna kopija je iz novije verzije aplikacije — ažurirajte pa pokušajte ponovo',
    );
  }

  // Slike iz arhive (validno ime unutar photos/).
  const photoFiles: { name: string; data: Uint8Array }[] = [];
  for (const [entryName, data] of Object.entries(entries)) {
    if (!entryName.startsWith('photos/')) continue;
    const base = safePhotoName(entryName);
    if (base !== null) photoFiles.push({ name: base, data });
  }

  // --- Baza: obriši sve, pa dvoprolazno ubaci (osobe bez FK, pa roditelji) ---
  const insertPerson = db.prepare(
    `INSERT INTO persons (id, first_name, last_name, maiden_name, gender, title, birth_date, death_date,
        birth_place, notes, photo_id, gedcom_xref, is_family_head, created_at, updated_at)
     VALUES (@id, @first_name, @last_name, @maiden_name, @gender, @title, @birth_date, @death_date,
        @birth_place, @notes, @photo_id, @gedcom_xref, @is_family_head, @created_at, @updated_at)`,
  );
  const setParents = db.prepare('UPDATE persons SET father_id = ?, mother_id = ? WHERE id = ?');
  const insertUnion = db.prepare(
    `INSERT INTO unions (id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes)
     VALUES (@id, @partner1_id, @partner2_id, @type, @start_date, @end_date, @end_reason, @notes)`,
  );

  const tx = db.transaction(() => {
    db.exec('DELETE FROM unions; DELETE FROM persons;');
    for (const p of manifest.persons) {
      insertPerson.run({ ...p, father_id: null, mother_id: null });
    }
    for (const p of manifest.persons) {
      if (p.father_id !== null || p.mother_id !== null) setParents.run(p.father_id, p.mother_id, p.id);
    }
    for (const u of manifest.unions) insertUnion.run(u);
  });
  tx();

  // --- Slike: upiši u privremeni folder pa zameni (baza je već uspešno vraćena) ---
  const dir = photosDir(dataDir);
  const parent = path.dirname(dir);
  const tmpDir = path.join(parent, `photos.restore-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  for (const f of photoFiles) fs.writeFileSync(path.join(tmpDir, f.name), f.data);

  const oldDir = path.join(parent, `photos.old-${Date.now()}`);
  if (fs.existsSync(dir)) fs.renameSync(dir, oldDir);
  fs.renameSync(tmpDir, dir);
  fs.rmSync(oldDir, { recursive: true, force: true });

  return {
    persons: manifest.persons.length,
    unions: manifest.unions.length,
    photos: photoFiles.length,
  };
}
