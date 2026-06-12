import { Router } from 'express';
import multer from 'multer';
import type { DB } from '../db';
import type { GedcomImportResult, GedcomWarning, Person, Union } from '@shared/types';
import type { GedcomParseResult } from '../gedcom/types';
import { AppError } from '../middleware/errors';

type ImportModule = { parseGedcom(input: Buffer | string): GedcomParseResult };
type ExportModule = { serializeGedcom(persons: Person[], unions: Union[]): string };

// Dinamički import: module piše paralelni agent po ugovoru u gedcom/types.ts —
// ovako se app diže (i testovi rade) i pre nego što oni postoje.
async function loadImportModule(): Promise<ImportModule> {
  return (await import('../gedcom/import')) as ImportModule;
}
async function loadExportModule(): Promise<ExportModule> {
  return (await import('../gedcom/export')) as ExportModule;
}

/** Mapiranje drafta u bazu: 2 prolaza (osobe pa roditeljski FK + unions); dry_run = namerni rollback. */
function importIntoDb(
  db: DB,
  parsed: GedcomParseResult,
  mode: 'replace' | 'merge',
  dryRun: boolean,
): GedcomImportResult {
  let personsCreated = 0;
  let unionsCreated = 0;
  let matched = 0;
  let unresolvedParents = 0;
  let unresolvedParentSample: string | undefined;
  let skippedUnions = 0;
  let skippedUnionSample: string | undefined;

  const rollback = new Error('dry_run rollback');
  const tx = db.transaction(() => {
    if (mode === 'replace') {
      db.exec('DELETE FROM unions; DELETE FROM persons;');
    }

    const xrefToId = new Map<string, number>();
    if (mode === 'merge') {
      const rows = db
        .prepare('SELECT id, gedcom_xref FROM persons WHERE gedcom_xref IS NOT NULL')
        .all() as { id: number; gedcom_xref: string }[];
      for (const row of rows) xrefToId.set(row.gedcom_xref, row.id);
    }

    // 1. prolaz: osobe (bez roditeljskih FK — xref-ovi još nisu razrešeni)
    const insertPerson = db.prepare(
      `INSERT INTO persons (first_name, last_name, maiden_name, gender, title, birth_date, death_date, birth_place, notes, gedcom_xref)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    );
    const newIds = new Set<number>();
    for (const d of parsed.persons) {
      if (xrefToId.has(d.xref)) {
        matched++;
        continue;
      }
      const info = insertPerson.run(
        d.first_name,
        d.last_name,
        d.maiden_name,
        d.gender,
        d.title,
        d.birth_date,
        d.death_date,
        d.birth_place,
        d.notes,
        d.xref,
      );
      const id = Number(info.lastInsertRowid);
      xrefToId.set(d.xref, id);
      newIds.add(id);
      personsCreated++;
    }

    // 2. prolaz: roditeljski FK samo za novoubačene osobe
    const setParents = db.prepare('UPDATE persons SET father_id = ?, mother_id = ? WHERE id = ?');
    for (const d of parsed.persons) {
      const id = xrefToId.get(d.xref);
      if (id === undefined || !newIds.has(id)) continue;
      let fatherId: number | null = null;
      let motherId: number | null = null;
      if (d.father_xref) {
        fatherId = xrefToId.get(d.father_xref) ?? null;
        if (fatherId === null) {
          unresolvedParents++;
          unresolvedParentSample ??= d.father_xref;
        }
      }
      if (d.mother_xref) {
        motherId = xrefToId.get(d.mother_xref) ?? null;
        if (motherId === null) {
          unresolvedParents++;
          unresolvedParentSample ??= d.mother_xref;
        }
      }
      if (fatherId !== null || motherId !== null) setParents.run(fatherId, motherId, id);
    }

    // unions — preskoči ako bilo koji xref nije razrešiv
    const findDup = db.prepare('SELECT id FROM unions WHERE partner1_id = ? AND partner2_id = ? AND start_date IS ?');
    const insertUnion = db.prepare(
      `INSERT INTO unions (partner1_id, partner2_id, type, start_date, end_date, end_reason, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    );
    for (const u of parsed.unions) {
      const id1 = u.partner1_xref ? xrefToId.get(u.partner1_xref) : undefined;
      const id2 = u.partner2_xref ? xrefToId.get(u.partner2_xref) : undefined;
      if (id1 === undefined || id2 === undefined || id1 === id2) {
        skippedUnions++;
        skippedUnionSample ??= `${u.partner1_xref ?? '?'} + ${u.partner2_xref ?? '?'}`;
        continue;
      }
      const [p1, p2] = id1 < id2 ? [id1, id2] : [id2, id1];
      if (findDup.get(p1, p2, u.start_date)) continue;
      insertUnion.run(p1, p2, u.type, u.start_date, u.end_date, u.end_reason, u.notes);
      unionsCreated++;
    }

    if (dryRun) throw rollback;
  });

  try {
    tx();
  } catch (err) {
    if (err !== rollback) throw err;
  }

  const warnings: GedcomWarning[] = [...parsed.warnings];
  if (unresolvedParents > 0) warnings.push({ tag: 'FAMC', count: unresolvedParents, sample: unresolvedParentSample });
  if (skippedUnions > 0) warnings.push({ tag: 'FAM', count: skippedUnions, sample: skippedUnionSample });

  return {
    persons_created: personsCreated,
    unions_created: unionsCreated,
    matched,
    warnings,
    dry_run: dryRun,
  };
}

export function createGedcomRouter(db: DB): Router {
  const router = Router();
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });

  router.get('/export', async (_req, res) => {
    const { serializeGedcom } = await loadExportModule();
    const persons = db.prepare('SELECT * FROM persons ORDER BY id').all() as Person[];
    const unions = db
      .prepare('SELECT id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes FROM unions ORDER BY id')
      .all() as Union[];
    const ged = serializeGedcom(persons, unions);
    res.set('Content-Type', 'text/gedcom; charset=utf-8');
    res.set('Content-Disposition', 'attachment; filename="porodicno-stablo.ged"');
    res.send(ged);
  });

  router.post('/import', upload.single('file'), async (req, res) => {
    const mode = req.query.mode ?? 'merge';
    if (mode !== 'replace' && mode !== 'merge') {
      throw new AppError(400, 'validation', "Parametar mode mora biti 'replace' ili 'merge'");
    }
    const dryRun = req.query.dry_run === '1' || req.query.dry_run === 'true';
    if (!req.file) throw new AppError(400, 'validation', 'Nedostaje fajl u polju "file"');

    const { parseGedcom } = await loadImportModule();
    let parsed: GedcomParseResult;
    try {
      parsed = parseGedcom(req.file.buffer);
    } catch (err) {
      throw new AppError(400, 'invalid_gedcom', err instanceof Error ? err.message : 'Neispravan GEDCOM fajl');
    }
    res.json(importIntoDb(db, parsed, mode, dryRun));
  });

  return router;
}
