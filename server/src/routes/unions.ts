import { Router } from 'express';
import type { DB } from '../db';
import { unionInputSchema, unionPatchSchema } from '@shared/schemas';
import type { Union } from '@shared/types';
import { AppError, parseId } from '../middleware/errors';
import { onlyPresentKeys } from '../lib/patch';

const UNION_COLS = 'id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes';

function getUnion(db: DB, id: number): Union | null {
  const row = db.prepare(`SELECT ${UNION_COLS} FROM unions WHERE id = ?`).get(id) as Union | undefined;
  return row ?? null;
}

export function createUnionsRouter(db: DB): Router {
  const router = Router();

  router.post('/', (req, res) => {
    const input = unionInputSchema.parse(req.body);
    // kanonski red partnera
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
        `INSERT INTO unions (partner1_id, partner2_id, type, start_date, end_date, end_reason, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(p1, p2, input.type, input.start_date, input.end_date, input.end_reason, input.notes);
    res.status(201).json(getUnion(db, Number(info.lastInsertRowid)));
  });

  router.patch('/:id', (req, res) => {
    const id = parseId(req.params.id);
    if (!getUnion(db, id)) throw new AppError(404, 'not_found');
    const patch = onlyPresentKeys(unionPatchSchema.parse(req.body), req.body);
    const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
    if (entries.length > 0) {
      const setSql = entries.map(([k]) => `${k} = @${k}`).join(', ');
      db.prepare(`UPDATE unions SET ${setSql} WHERE id = @__id`).run({ ...Object.fromEntries(entries), __id: id });
    }
    res.json(getUnion(db, id));
  });

  router.delete('/:id', (req, res) => {
    const id = parseId(req.params.id);
    const info = db.prepare('DELETE FROM unions WHERE id = ?').run(id);
    if (info.changes === 0) throw new AppError(404, 'not_found');
    res.status(204).end();
  });

  return router;
}
