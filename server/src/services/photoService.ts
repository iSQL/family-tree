import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import type { DB } from '../db';
import { AppError } from '../middleware/errors';

/** Striktna validacija imena slike (UUID) — sprečava path traversal kroz segment putanje. */
export const PHOTO_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function photosDir(dataDir: string): string {
  return path.join(path.resolve(dataDir), 'photos');
}

export function photoFilePath(dataDir: string, photoId: string, size: 'full' | 'thumb'): string {
  const name = size === 'thumb' ? `${photoId}.thumb.webp` : `${photoId}.webp`;
  return path.join(photosDir(dataDir), name);
}

export function deletePhotoFiles(dataDir: string, photoId: string): void {
  for (const size of ['full', 'thumb'] as const) {
    fs.rmSync(photoFilePath(dataDir, photoId, size), { force: true });
  }
}

/**
 * Dekodira (validacija), rotira po EXIF orijentaciji (webp izlaz ne nosi EXIF/GPS) i
 * piše {uuid}.webp (1600 inside) + {uuid}.thumb.webp (320x320 cover). Vraća uuid.
 */
export async function writePhotoFiles(dataDir: string, buffer: Buffer): Promise<string> {
  let full: Buffer;
  let thumb: Buffer;
  try {
    full = await sharp(buffer)
      .rotate()
      .resize(1600, 1600, { fit: 'inside', withoutEnlargement: true })
      .webp()
      .toBuffer();
    thumb = await sharp(buffer).rotate().resize(320, 320, { fit: 'cover' }).webp().toBuffer();
  } catch {
    throw new AppError(400, 'invalid_image', 'Fajl nije važeća slika');
  }

  const dir = photosDir(dataDir);
  fs.mkdirSync(dir, { recursive: true });
  const photoId = randomUUID();
  fs.writeFileSync(path.join(dir, `${photoId}.webp`), full);
  fs.writeFileSync(path.join(dir, `${photoId}.thumb.webp`), thumb);
  return photoId;
}

/** Nova slika osobe u glavnom stablu — fajlovi prethodne slike se brišu. */
export async function savePhoto(db: DB, dataDir: string, personId: number, buffer: Buffer): Promise<string> {
  const person = db.prepare('SELECT id, photo_id FROM persons WHERE id = ?').get(personId) as
    | { id: number; photo_id: string | null }
    | undefined;
  if (!person) throw new AppError(404, 'not_found');

  const photoId = await writePhotoFiles(dataDir, buffer);
  db.prepare("UPDATE persons SET photo_id = ?, updated_at = datetime('now') WHERE id = ?").run(photoId, personId);
  if (person.photo_id) deletePhotoFiles(dataDir, person.photo_id);

  return photoId;
}

export function deletePhoto(db: DB, dataDir: string, personId: number): void {
  const person = db.prepare('SELECT id, photo_id FROM persons WHERE id = ?').get(personId) as
    | { id: number; photo_id: string | null }
    | undefined;
  if (!person) throw new AppError(404, 'not_found');
  if (person.photo_id) {
    deletePhotoFiles(dataDir, person.photo_id);
    db.prepare("UPDATE persons SET photo_id = NULL, updated_at = datetime('now') WHERE id = ?").run(personId);
  }
}
