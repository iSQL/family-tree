import type { DB } from '../db';
import type { UnionInput, UnionPatch } from '@shared/schemas';
import type { Union } from '@shared/types';
import { AppError } from '../middleware/errors';

const UNION_COLS = 'id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes';

export function getUnion(db: DB, id: number): Union | null {
  const row = db.prepare(`SELECT ${UNION_COLS} FROM unions WHERE id = ?`).get(id) as Union | undefined;
  return row ?? null;
}

/**
 * Novi brak/partnerstvo — kanonski red partnera (partner1_id < partner2_id); oba partnera moraju postojati.
 * `id` zadaje samo režim predloga (brakovi iz grane imaju ID-jeve iznad glavnog stabla).
 */
export function createUnion(db: DB, input: UnionInput, id?: number): Union {
  const [p1, p2] =
    input.partner1_id < input.partner2_id
      ? [input.partner1_id, input.partner2_id]
      : [input.partner2_id, input.partner1_id];

  const personExists = db.prepare('SELECT 1 FROM persons WHERE id = ?');
  if (!personExists.get(p1) || !personExists.get(p2)) {
    throw new AppError(422, 'invalid_partner', 'Partner ne postoji');
  }

  const dup = db
    .prepare('SELECT id FROM unions WHERE partner1_id = ? AND partner2_id = ? AND start_date IS ?')
    .get(p1, p2, input.start_date);
  if (dup) throw new AppError(409, 'duplicate_union', 'Brak između ovih osoba sa istim datumom već postoji');

  const info = db
    .prepare(
      `INSERT INTO unions (id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(id ?? null, p1, p2, input.type, input.start_date, input.end_date, input.end_reason, input.notes);
  return getUnion(db, Number(info.lastInsertRowid))!;
}

/** Izmena braka — partneri se ne menjaju (obriši pa napravi novi). Nedostajući ključevi se ne diraju. */
export function updateUnion(db: DB, id: number, patch: UnionPatch): Union {
  if (!getUnion(db, id)) throw new AppError(404, 'not_found');
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length > 0) {
    const setSql = entries.map(([k]) => `${k} = @${k}`).join(', ');
    db.prepare(`UPDATE unions SET ${setSql} WHERE id = @__id`).run({ ...Object.fromEntries(entries), __id: id });
  }
  return getUnion(db, id)!;
}

export function deleteUnion(db: DB, id: number): void {
  const info = db.prepare('DELETE FROM unions WHERE id = ?').run(id);
  if (info.changes === 0) throw new AppError(404, 'not_found');
}
