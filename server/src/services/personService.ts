import type { DB } from '../db';
import type {
  HalfSibling,
  Person,
  PersonDetail,
  PersonSlim,
  SiblingSlim,
  TreeResponse,
  Union,
  UnionWithPartner,
} from '@shared/types';
import type { PersonInput, PersonPatch } from '@shared/schemas';
import { AppError } from '../middleware/errors';

const SLIM_COLS =
  'id, first_name, last_name, maiden_name, gender, title, birth_date, death_date, photo_id, father_id, mother_id';
const UNION_COLS = 'id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes';

/** Poređenje parcijalnih ISO datuma — leksikografski; NULL na kraju. */
function compareDates(a: string | null, b: string | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? -1 : a > b ? 1 : 0;
}

const byBirth = (a: PersonSlim, b: PersonSlim) => compareDates(a.birth_date, b.birth_date) || a.id - b.id;

export function getTree(db: DB): TreeResponse {
  const persons = db.prepare(`SELECT ${SLIM_COLS} FROM persons ORDER BY id`).all() as PersonSlim[];
  const unions = db.prepare(`SELECT ${UNION_COLS} FROM unions ORDER BY id`).all() as Union[];
  return { persons, unions };
}

export function getPerson(db: DB, id: number): Person | null {
  const row = db.prepare('SELECT * FROM persons WHERE id = ?').get(id) as Person | undefined;
  return row ?? null;
}

function getSlim(db: DB, id: number | null): PersonSlim | null {
  if (id === null) return null;
  const row = db.prepare(`SELECT ${SLIM_COLS} FROM persons WHERE id = ?`).get(id) as PersonSlim | undefined;
  return row ?? null;
}

export function getPersonDetail(db: DB, id: number): PersonDetail | null {
  const person = getPerson(db, id);
  if (!person) return null;

  const sibRows = db
    .prepare(
      `SELECT ${SLIM_COLS} FROM persons
       WHERE id <> @id AND (
         (@father_id IS NOT NULL AND father_id = @father_id) OR
         (@mother_id IS NOT NULL AND mother_id = @mother_id)
       )`,
    )
    .all({ id, father_id: person.father_id, mother_id: person.mother_id }) as PersonSlim[];

  const siblings: SiblingSlim[] = sibRows
    .map((s) => {
      const sharesFather = person.father_id !== null && s.father_id === person.father_id;
      const sharesMother = person.mother_id !== null && s.mother_id === person.mother_id;
      const half: HalfSibling = sharesFather && sharesMother ? false : sharesFather ? 'paternal' : 'maternal';
      return { ...s, half };
    })
    .sort(byBirth);

  const unionRows = db
    .prepare(`SELECT ${UNION_COLS} FROM unions WHERE partner1_id = ? OR partner2_id = ?`)
    .all(id, id) as Union[];
  const unions: UnionWithPartner[] = unionRows
    .map((u) => ({ ...u, partner: getSlim(db, u.partner1_id === id ? u.partner2_id : u.partner1_id) }))
    .sort((a, b) => compareDates(a.start_date, b.start_date) || a.id - b.id);

  const children = (
    db.prepare(`SELECT ${SLIM_COLS} FROM persons WHERE father_id = ? OR mother_id = ?`).all(id, id) as PersonSlim[]
  ).sort(byBirth);

  return {
    ...person,
    father: getSlim(db, person.father_id),
    mother: getSlim(db, person.mother_id),
    siblings,
    unions,
    children,
  };
}

/** Da li je `candidateId` potomak osobe `personId` (BFS kroz decu). */
function isDescendantOf(db: DB, personId: number, candidateId: number): boolean {
  const childrenStmt = db.prepare('SELECT id FROM persons WHERE father_id = ? OR mother_id = ?');
  const queue = [personId];
  const seen = new Set<number>([personId]);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const row of childrenStmt.all(cur, cur) as { id: number }[]) {
      if (row.id === candidateId) return true;
      if (!seen.has(row.id)) {
        seen.add(row.id);
        queue.push(row.id);
      }
    }
  }
  return false;
}

/** personId je null kod kreiranja (nova osoba nema potomke ni sebe). */
function assertValidParent(db: DB, parentId: number | null, personId: number | null): void {
  if (parentId === null) return;
  const exists = db.prepare('SELECT 1 FROM persons WHERE id = ?').get(parentId);
  if (!exists) throw new AppError(422, 'invalid_parent', 'Izabrani roditelj ne postoji');
  if (personId !== null) {
    if (parentId === personId) {
      throw new AppError(422, 'cycle', 'Osoba ne može biti sama sebi roditelj');
    }
    if (isDescendantOf(db, personId, parentId)) {
      throw new AppError(422, 'cycle', 'Novi roditelj je potomak osobe — ciklus nije dozvoljen');
    }
  }
}

export function createPerson(db: DB, input: PersonInput): Person {
  assertValidParent(db, input.father_id, null);
  assertValidParent(db, input.mother_id, null);
  const info = db
    .prepare(
      `INSERT INTO persons (first_name, last_name, maiden_name, gender, title, birth_date, death_date, birth_place, notes, father_id, mother_id)
       VALUES (@first_name, @last_name, @maiden_name, @gender, @title, @birth_date, @death_date, @birth_place, @notes, @father_id, @mother_id)`,
    )
    .run(input);
  return getPerson(db, Number(info.lastInsertRowid))!;
}

export function updatePerson(db: DB, id: number, patch: PersonPatch): Person {
  const person = getPerson(db, id);
  if (!person) throw new AppError(404, 'not_found');

  // Ciklus-provera (BFS kroz potomke) je skupa — pokreni je samo kad se roditelj
  // STVARNO menja. Nepromenjena vrednost je već bila validna, pa preskači.
  if (patch.father_id !== undefined && patch.father_id !== person.father_id) {
    assertValidParent(db, patch.father_id, id);
  }
  if (patch.mother_id !== undefined && patch.mother_id !== person.mother_id) {
    assertValidParent(db, patch.mother_id, id);
  }

  // Samo prisutni ključevi — nedostajući se ne diraju.
  const entries = Object.entries(patch).filter(([, v]) => v !== undefined);
  if (entries.length === 0) return person;

  const setSql = entries.map(([k]) => `${k} = @${k}`).join(', ');
  db.prepare(`UPDATE persons SET ${setSql}, updated_at = datetime('now') WHERE id = @__id`).run({
    ...Object.fromEntries(entries),
    __id: id,
  });
  return getPerson(db, id)!;
}

/** Briše osobu i vraća obrisani red (zbog čišćenja slika u ruti). FK deci → NULL je u DDL-u. */
export function deletePerson(db: DB, id: number): Person {
  const person = getPerson(db, id);
  if (!person) throw new AppError(404, 'not_found');
  db.prepare('DELETE FROM persons WHERE id = ?').run(id);
  return person;
}
