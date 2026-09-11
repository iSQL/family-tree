/**
 * Grane predloga — „pull request" model nad celim stablom.
 *
 * Rođak sa pozivnim linkom radi u pravoj aplikaciji, ali svaka izmena (osobe, brakovi,
 * slike, oznaka porodice) beleži se kao operacija u grani tog linka (proposal_ops), a
 * glavno stablo ostaje netaknuto. Čitanje u režimu predloga = glavno stablo + operacije
 * grane, primenjene kroz ISTE servisne funkcije (iste provere) u transakciji koja se na
 * kraju poništava. Jedan link = jedna zajednička grana.
 *
 * Administrator vidi neto izmene po osobi/braku (nova, izmena polja staro → novo,
 * brisanje) sa konfliktima kad se glavno stablo u međuvremenu promenilo, pa izabrane
 * spaja ili odbacuje.
 */
import crypto from 'node:crypto';
import type { DB } from '../db';
import { birthYear, findPossibleDuplicates, nameWithYear, personName } from '@shared/duplicates';
import { foldForSearch } from '@shared/search';
import type { CreateProposalTokenInput, PersonInput, PersonPatch, UnionInput, UnionPatch } from '@shared/schemas';
import type {
  BranchAction,
  BranchChange,
  BranchChangesResponse,
  BranchEntity,
  BranchFieldChange,
  BranchMergeResult,
  BranchSessionInfo,
  Gender,
  Person,
  PersonDetail,
  ProposalToken,
  TreeResponse,
  Union,
  UnionEndReason,
  UnionType,
} from '@shared/types';
import { AppError } from '../middleware/errors';
import { createPerson, deletePerson, getPerson, getPersonDetail, getTree, updatePerson } from './personService';
import { deletePhotoFiles } from './photoService';
import { createUnion, deleteUnion, getUnion, updateUnion } from './unionService';

/** ID-jevi osoba i brakova napravljenih u grani — daleko iznad glavnog stabla; u bazi postoje samo tokom primene grane. */
export const BRANCH_ID_BASE = 1_000_000_000;
/** Najviše operacija u jednoj grani. */
export const MAX_BRANCH_OPS = 5000;

const DAY_MS = 24 * 60 * 60 * 1000;

const PERSON_FIELDS = [
  'first_name', 'last_name', 'maiden_name', 'gender', 'title', 'birth_date', 'death_date',
  'birth_place', 'notes', 'father_id', 'mother_id', 'is_family_head', 'photo_id',
] as const;
const UNION_FIELDS = ['partner1_id', 'partner2_id', 'type', 'start_date', 'end_date', 'end_reason', 'notes'] as const;
const REF_FIELDS = new Set<string>(['father_id', 'mother_id', 'partner1_id', 'partner2_id']);

/** Grana iz sesije: link i ime autora izmena. */
export interface BranchContext {
  token_id: number;
  author: string;
}

const isBranchId = (id: number) => id >= BRANCH_ID_BASE;
const sameValue = (a: unknown, b: unknown) => (a ?? null) === (b ?? null);
const isEmptyValue = (v: unknown) => v === null || v === undefined || v === '' || v === false;
const nowIso = () => new Date().toISOString();

// --- Pozivni linkovi ---

interface TokenRow {
  id: number;
  token: string;
  label: string;
  created_at: string;
  expires_at: string;
  revoked: number;
  next_local_id: number;
  submitted_at: string | null;
  submitted_by: string | null;
  submit_note: string | null;
}

function getTokenRow(db: DB, id: number): TokenRow | undefined {
  return db.prepare('SELECT * FROM proposal_tokens WHERE id = ?').get(id) as TokenRow | undefined;
}

function isOpen(row: TokenRow): boolean {
  return row.revoked === 0 && Date.parse(row.expires_at) > Date.now();
}

function hasOps(db: DB, tokenId: number): boolean {
  return db.prepare('SELECT 1 FROM proposal_ops WHERE token_id = ? LIMIT 1').get(tokenId) !== undefined;
}

function toToken(db: DB, row: TokenRow): ProposalToken {
  return {
    id: row.id,
    token: row.token,
    label: row.label,
    created_at: row.created_at,
    expires_at: row.expires_at,
    revoked: row.revoked === 1,
    change_count: hasOps(db, row.id) ? computeChanges(db, row.id).changes.length : 0,
    submitted_at: row.submitted_at,
    submitted_by: row.submitted_by,
    submit_note: row.submit_note,
  };
}

export function assertTokenExists(db: DB, id: number): void {
  if (!getTokenRow(db, id)) throw new AppError(404, 'not_found', 'Link nije pronađen');
}

export function createToken(db: DB, input: CreateProposalTokenInput): ProposalToken {
  const now = Date.now();
  const info = db
    .prepare('INSERT INTO proposal_tokens (token, label, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .run(
      crypto.randomBytes(24).toString('base64url'),
      input.label,
      new Date(now).toISOString(),
      new Date(now + input.expires_in_days * DAY_MS).toISOString(),
    );
  return toToken(db, getTokenRow(db, Number(info.lastInsertRowid))!);
}

export function listTokens(db: DB): ProposalToken[] {
  return (db.prepare('SELECT * FROM proposal_tokens ORDER BY id DESC').all() as TokenRow[]).map((row) =>
    toToken(db, row),
  );
}

export function getToken(db: DB, id: number): ProposalToken {
  assertTokenExists(db, id);
  return toToken(db, getTokenRow(db, id)!);
}

export function revokeToken(db: DB, id: number): void {
  const info = db.prepare('UPDATE proposal_tokens SET revoked = 1 WHERE id = ?').run(id);
  if (info.changes === 0) throw new AppError(404, 'not_found', 'Link nije pronađen');
}

/** Link koji pušta u granu: postoji, nije opozvan, rok nije istekao. */
export function requireOpenToken(db: DB, tokenStr: string): TokenRow {
  const row = db.prepare('SELECT * FROM proposal_tokens WHERE token = ?').get(tokenStr) as TokenRow | undefined;
  if (!row || !isOpen(row)) throw new AppError(404, 'invalid_token', 'Pozivni link je nevažeći ili je istekao');
  return row;
}

export function isBranchOpen(db: DB, tokenId: number): boolean {
  const row = getTokenRow(db, tokenId);
  return row !== undefined && isOpen(row);
}

export function branchSessionInfo(db: DB, ctx: BranchContext | undefined): BranchSessionInfo | null {
  if (!ctx) return null;
  const row = getTokenRow(db, ctx.token_id);
  if (!row || !isOpen(row)) return null;
  return {
    token_id: row.id,
    label: row.label,
    expires_at: row.expires_at,
    author_name: ctx.author,
    submitted_at: row.submitted_at,
  };
}

/** Grane poslate na odobrenje koje još imaju izmene. */
export function pendingReviewCount(db: DB): number {
  const row = db
    .prepare(
      `SELECT COUNT(*) AS n FROM proposal_tokens t
       WHERE t.submitted_at IS NOT NULL AND EXISTS (SELECT 1 FROM proposal_ops o WHERE o.token_id = t.id)`,
    )
    .get() as { n: number };
  return row.n;
}

export function submitBranch(db: DB, ctx: BranchContext, note: string | null): void {
  if (!hasOps(db, ctx.token_id)) throw new AppError(409, 'nothing_to_submit', 'U grani nema izmena za slanje');
  db.prepare('UPDATE proposal_tokens SET submitted_at = ?, submitted_by = ?, submit_note = ? WHERE id = ?').run(
    nowIso(),
    ctx.author,
    note,
    ctx.token_id,
  );
}

function clearSubmittedIfEmpty(db: DB, tokenId: number): void {
  if (!hasOps(db, tokenId)) {
    db.prepare('UPDATE proposal_tokens SET submitted_at = NULL, submitted_by = NULL, submit_note = NULL WHERE id = ?').run(
      tokenId,
    );
  }
}

// --- Operacije i primena grane ---

interface OpRow {
  id: number;
  token_id: number;
  entity: BranchEntity;
  entity_id: number;
  action: BranchAction;
  payload: string;
  author: string;
  created_at: string;
}

interface FieldDelta {
  from: unknown;
  to: unknown;
}

/** Kako je postojeća osoba izgledala kad je izmena napravljena — otkriva ID koji sada pokazuje na drugu osobu. */
interface Identity {
  first_name: string;
  last_name: string;
  birth_date: string | null;
}

interface OpPayload {
  input?: Record<string, unknown>;
  changes?: Record<string, FieldDelta>;
  ref?: Identity;
  label?: string;
}

interface NewOp {
  entity: BranchEntity;
  entity_id: number;
  action: BranchAction;
  payload: OpPayload;
}

function loadOps(db: DB, tokenId: number): OpRow[] {
  return db.prepare('SELECT * FROM proposal_ops WHERE token_id = ? ORDER BY id').all(tokenId) as OpRow[];
}

const parsePayload = (op: OpRow) => JSON.parse(op.payload) as OpPayload;

function insertOp(db: DB, ctx: BranchContext, op: NewOp): void {
  const { n } = db.prepare('SELECT COUNT(*) AS n FROM proposal_ops WHERE token_id = ?').get(ctx.token_id) as {
    n: number;
  };
  if (n >= MAX_BRANCH_OPS) {
    throw new AppError(429, 'branch_full', 'Grana ima previše izmena — sačekajte da administrator pregleda postojeće');
  }
  db.prepare(
    `INSERT INTO proposal_ops (token_id, entity, entity_id, action, payload, author, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  ).run(ctx.token_id, op.entity, op.entity_id, op.action, JSON.stringify(op.payload), ctx.author, nowIso());
}

function allocateLocalId(db: DB, tokenId: number): number {
  const row = db
    .prepare('UPDATE proposal_tokens SET next_local_id = next_local_id + 1 WHERE id = ? RETURNING next_local_id')
    .get(tokenId) as { next_local_id: number };
  return BRANCH_ID_BASE + row.next_local_id - 1;
}

function applyOp(db: DB, op: OpRow): void {
  const p = parsePayload(op);
  const values = Object.fromEntries(Object.entries(p.changes ?? {}).map(([f, d]) => [f, d.to]));
  if (op.entity === 'person') {
    if (op.action === 'create') createPerson(db, p.input as PersonInput, op.entity_id);
    else if (op.action === 'update') updatePerson(db, op.entity_id, values as PersonPatch);
    else deletePerson(db, op.entity_id);
  } else if (op.action === 'create') {
    createUnion(db, p.input as UnionInput, op.entity_id);
  } else if (op.action === 'update') {
    updateUnion(db, op.entity_id, values as UnionPatch);
  } else {
    deleteUnion(db, op.entity_id);
  }
}

/** Primeni operacije redom; ona koja više ne može (npr. osoba obrisana u glavnom stablu) se preskače i beleži. */
function replay(db: DB, ops: OpRow[]): Map<number, string> {
  const broken = new Map<number, string>();
  const applyOne = db.transaction((op: OpRow) => applyOp(db, op)); // ugnežđeno = SAVEPOINT
  for (const op of ops) {
    try {
      applyOne(op);
    } catch (err) {
      broken.set(
        op.id,
        err instanceof AppError && err.message !== err.code
          ? err.message
          : 'Izmena ne može da se primeni na trenutno stablo',
      );
    }
  }
  return broken;
}

const ROLLBACK = Symbol('branch-rollback');

/** Pokreni fn nad glavnim stablom sa primenjenom granom, pa sve poništi. */
export function inBranch<T>(db: DB, tokenId: number, fn: (broken: Map<number, string>, ops: OpRow[]) => T): T {
  const ops = loadOps(db, tokenId);
  const box: { value?: T } = {};
  try {
    db.transaction(() => {
      box.value = fn(replay(db, ops), ops);
      throw ROLLBACK;
    })();
  } catch (err) {
    if (err !== ROLLBACK) throw err;
  }
  return box.value as T;
}

function identity(p: Identity): Identity {
  return { first_name: p.first_name, last_name: p.last_name, birth_date: p.birth_date };
}

function sameIdentity(a: Identity, b: Identity): boolean {
  const fold = (s: string) => foldForSearch(s.trim());
  const ya = birthYear(a.birth_date);
  const yb = birthYear(b.birth_date);
  return (
    fold(a.first_name) === fold(b.first_name) &&
    fold(a.last_name) === fold(b.last_name) &&
    (ya === null || yb === null || ya === yb)
  );
}

function diffFields(
  before: Record<string, unknown>,
  patch: Record<string, unknown>,
  fields: readonly string[],
): Record<string, FieldDelta> {
  const out: Record<string, FieldDelta> = {};
  for (const f of fields) {
    if (patch[f] !== undefined && !sameValue(before[f], patch[f])) out[f] = { from: before[f] ?? null, to: patch[f] };
  }
  return out;
}

const asRecord = (v: object) => v as unknown as Record<string, unknown>;

// --- Rad u grani (rute režima predloga) ---

export function branchGetTree(db: DB, ctx: BranchContext): TreeResponse {
  return inBranch(db, ctx.token_id, () => getTree(db));
}

export function branchGetPerson(db: DB, ctx: BranchContext, id: number): PersonDetail {
  return inBranch(db, ctx.token_id, () => {
    const detail = getPersonDetail(db, id);
    if (!detail) throw new AppError(404, 'not_found');
    return detail;
  });
}

export function branchCreatePerson(db: DB, ctx: BranchContext, input: PersonInput): PersonDetail {
  const id = allocateLocalId(db, ctx.token_id);
  const detail = inBranch(db, ctx.token_id, () => {
    createPerson(db, input, id);
    return getPersonDetail(db, id)!;
  });
  insertOp(db, ctx, { entity: 'person', entity_id: id, action: 'create', payload: { input } });
  return detail;
}

/** Beleži samo polja koja se stvarno menjaju (forma šalje sva) — da ne pregazi kasnije izmene glavnog stabla. */
export function branchUpdatePerson(
  db: DB,
  ctx: BranchContext,
  id: number,
  patch: Record<string, unknown>,
): PersonDetail {
  const { detail, op } = inBranch(db, ctx.token_id, () => {
    const before = getPerson(db, id);
    if (!before) throw new AppError(404, 'not_found');
    const changes = diffFields(asRecord(before), patch, PERSON_FIELDS);
    let op: NewOp | null = null;
    if (Object.keys(changes).length > 0) {
      updatePerson(db, id, Object.fromEntries(Object.entries(changes).map(([f, d]) => [f, d.to])) as PersonPatch);
      const after = asRecord(getPerson(db, id)!);
      for (const [f, d] of Object.entries(changes)) d.to = after[f];
      op = {
        entity: 'person',
        entity_id: id,
        action: 'update',
        payload: isBranchId(id) ? { changes } : { changes, ref: identity(before) },
      };
    }
    return { detail: getPersonDetail(db, id)!, op };
  });
  if (op) insertOp(db, ctx, op);
  return detail;
}

export function branchDeletePerson(db: DB, ctx: BranchContext, id: number): void {
  const before = inBranch(db, ctx.token_id, () => deletePerson(db, id));
  const label = nameWithYear(before);
  insertOp(db, ctx, {
    entity: 'person',
    entity_id: id,
    action: 'delete',
    payload: isBranchId(id) ? { label } : { label, ref: identity(before) },
  });
}

function unionLabelFor(nameOf: (id: number) => string, u: { partner1_id: unknown; partner2_id: unknown }): string {
  return `${nameOf(Number(u.partner1_id))} i ${nameOf(Number(u.partner2_id))}`;
}

const nameInDb = (db: DB) => (id: number) => {
  const p = getPerson(db, id);
  return p ? personName(p) : `#${id}`;
};

export function branchCreateUnion(db: DB, ctx: BranchContext, input: UnionInput): Union {
  const id = allocateLocalId(db, ctx.token_id);
  const union = inBranch(db, ctx.token_id, () => createUnion(db, input, id));
  insertOp(db, ctx, { entity: 'union', entity_id: id, action: 'create', payload: { input } });
  return union;
}

export function branchUpdateUnion(db: DB, ctx: BranchContext, id: number, patch: UnionPatch): Union {
  const { union, op } = inBranch(db, ctx.token_id, () => {
    const before = getUnion(db, id);
    if (!before) throw new AppError(404, 'not_found');
    const changes = diffFields(asRecord(before), patch, UNION_FIELDS);
    let op: NewOp | null = null;
    if (Object.keys(changes).length > 0) {
      const after = asRecord(
        updateUnion(db, id, Object.fromEntries(Object.entries(changes).map(([f, d]) => [f, d.to])) as UnionPatch),
      );
      for (const [f, d] of Object.entries(changes)) d.to = after[f];
      op = {
        entity: 'union',
        entity_id: id,
        action: 'update',
        payload: { changes, label: unionLabelFor(nameInDb(db), before) },
      };
    }
    return { union: getUnion(db, id)!, op };
  });
  if (op) insertOp(db, ctx, op);
  return union;
}

export function branchDeleteUnion(db: DB, ctx: BranchContext, id: number): void {
  const label = inBranch(db, ctx.token_id, () => {
    const union = getUnion(db, id);
    if (!union) throw new AppError(404, 'not_found');
    const text = unionLabelFor(nameInDb(db), union);
    deleteUnion(db, id);
    return text;
  });
  insertOp(db, ctx, { entity: 'union', entity_id: id, action: 'delete', payload: { label } });
}

// --- Pregled izmena ---

interface ComputedChanges extends BranchChangesResponse {
  /** Grupe operacija bez vidljivog efekta (npr. napravljeno pa obrisano) — čiste se pri spajanju/odbacivanju. */
  vanished: string[];
}

function allPersons(db: DB): Map<number, Person> {
  const rows = db.prepare('SELECT * FROM persons').all() as Person[];
  return new Map(rows.map((p) => [p.id, { ...p, is_family_head: Boolean(p.is_family_head) }]));
}

function allUnions(db: DB): Map<number, Union> {
  const rows = db
    .prepare('SELECT id, partner1_id, partner2_id, type, start_date, end_date, end_reason, notes FROM unions')
    .all() as Union[];
  return new Map(rows.map((u) => [u.id, u]));
}

export function computeChanges(db: DB, tokenId: number): ComputedChanges {
  const mainPersons = allPersons(db);
  const mainUnions = allUnions(db);

  return inBranch(db, tokenId, (broken, ops) => {
    const branchPersons = allPersons(db);
    const branchUnions = allUnions(db);
    const nameOfId = (id: number) => {
      const p = branchPersons.get(id) ?? mainPersons.get(id);
      return p ? personName(p) : `#${id}`;
    };

    const groups = new Map<string, OpRow[]>();
    for (const op of ops) {
      const key = `${op.entity}:${op.entity_id}`;
      const group = groups.get(key);
      if (group) group.push(op);
      else groups.set(key, [op]);
    }

    const changes: BranchChange[] = [];
    const vanished: string[] = [];

    for (const [key, group] of groups) {
      const first = group[0]!;
      const id = first.entity_id;
      const isPerson = first.entity === 'person';
      const payloads = group.map(parsePayload);
      const main = (isPerson ? mainPersons.get(id) : mainUnions.get(id)) as Record<string, unknown> | undefined;
      const branch = (isPerson ? branchPersons.get(id) : branchUnions.get(id)) as Record<string, unknown> | undefined;
      const fieldNames: readonly string[] = isPerson ? PERSON_FIELDS : UNION_FIELDS;
      const problems = group.flatMap((op) => {
        const message = broken.get(op.id);
        return message === undefined ? [] : [message];
      });
      const conflicts: string[] = [];
      const warnings: string[] = [];
      let fields: BranchFieldChange[] = [];
      let action: BranchAction;

      if (first.action === 'create') {
        action = 'create';
        const source = branch ?? (problems.length > 0 ? payloads[0]!.input : undefined);
        if (!source) {
          vanished.push(key); // napravljeno pa obrisano u grani
          continue;
        }
        fields = fieldNames
          .filter((f) => !isEmptyValue(source[f]))
          .map((f) => ({ field: f, from: null, to: source[f], current: null, conflict: false }));
        if (isPerson && branch) {
          const duplicates = findPossibleDuplicates(mainPersons.values(), branch as unknown as Person);
          if (duplicates.length > 0) {
            warnings.push(`Možda već postoji u stablu: ${duplicates.map(nameWithYear).join(', ')}`);
          }
        }
      } else if (group.some((op) => op.action === 'delete')) {
        action = 'delete';
        if (!main) problems.push(isPerson ? 'Osoba je već obrisana u glavnom stablu' : 'Brak je već obrisan u glavnom stablu');
      } else {
        action = 'update';
        if (!main) {
          if (problems.length === 0) {
            problems.push(isPerson ? 'Osoba više ne postoji u glavnom stablu' : 'Brak više ne postoji u glavnom stablu');
          }
        } else if (!branch) {
          vanished.push(key); // obrisano kaskadno drugom izmenom u grani
          continue;
        } else {
          const firstFrom = new Map<string, unknown>();
          for (const p of payloads) {
            for (const [f, d] of Object.entries(p.changes ?? {})) if (!firstFrom.has(f)) firstFrom.set(f, d.from);
          }
          for (const [f, from] of firstFrom) {
            const to = branch[f];
            if (sameValue(from, to)) continue;
            const current = main[f];
            fields.push({
              field: f,
              from,
              to,
              current,
              conflict: !sameValue(current, from) && !sameValue(current, to),
            });
          }
          if (fields.length === 0 && problems.length === 0) {
            vanished.push(key); // vraćeno na staro
            continue;
          }
        }
      }

      const ref = payloads.find((p) => p.ref)?.ref;
      if (isPerson && main && ref && !sameIdentity(ref, main as unknown as Identity)) {
        conflicts.push(
          `Izmena je pravljena nad „${personName(ref)}", a osoba #${id} je sada „${nameWithYear(main as unknown as Person)}"`,
        );
      }
      if (fields.some((f) => f.conflict)) conflicts.push('Deo polja je u međuvremenu promenjen u glavnom stablu');

      const source = branch ?? main ?? payloads[0]!.input;
      const storedLabel = payloads.find((p) => p.label)?.label;
      const label = source
        ? isPerson
          ? personName({ first_name: String(source.first_name ?? '?'), last_name: String(source.last_name ?? '') })
          : unionLabelFor(nameOfId, source as { partner1_id: unknown; partner2_id: unknown })
        : (storedLabel ?? key);

      const depends = new Set<string>();
      for (const f of fields) {
        if (REF_FIELDS.has(f.field) && typeof f.to === 'number' && isBranchId(f.to)) depends.add(`person:${f.to}`);
      }

      changes.push({
        key,
        entity: first.entity,
        entity_id: id,
        action,
        label,
        fields,
        status: problems.length > 0 ? 'broken' : conflicts.length > 0 ? 'conflict' : 'ok',
        problems: [...problems, ...conflicts],
        warnings,
        depends_on: [...depends].filter((d) => d !== key),
        authors: [...new Set(group.map((op) => op.author))],
        updated_at: group[group.length - 1]!.created_at,
      });
    }

    const keys = new Set(changes.map((c) => c.key));
    for (const c of changes) c.depends_on = c.depends_on.filter((d) => keys.has(d));

    const person_labels: Record<string, string> = {};
    for (const c of changes) {
      for (const f of c.fields) {
        if (!REF_FIELDS.has(f.field)) continue;
        for (const v of [f.from, f.to, f.current]) if (typeof v === 'number') person_labels[String(v)] = nameOfId(v);
      }
    }

    return { changes, person_labels, vanished };
  });
}

export function branchChangesResponse(computed: ComputedChanges): BranchChangesResponse {
  return { changes: computed.changes, person_labels: computed.person_labels };
}

function selectChanges(changes: BranchChange[], keys: string[]): Map<string, BranchChange> {
  const byKey = new Map(changes.map((c) => [c.key, c]));
  const selected = new Map<string, BranchChange>();
  for (const key of keys) {
    const change = byKey.get(key);
    if (!change) throw new AppError(409, 'change_not_found', 'Neka izmena više ne postoji — osvežite pregled');
    selected.set(key, change);
  }
  return selected;
}

function removeGroups(db: DB, tokenId: number, keys: Iterable<string>): string[] {
  const photos: string[] = [];
  const keySet = new Set(keys);
  for (const op of loadOps(db, tokenId)) {
    if (!keySet.has(`${op.entity}:${op.entity_id}`)) continue;
    const photo = parsePayload(op).changes?.photo_id?.to;
    if (typeof photo === 'string') photos.push(photo);
  }
  const del = db.prepare('DELETE FROM proposal_ops WHERE token_id = ? AND entity = ? AND entity_id = ?');
  for (const key of keySet) {
    const [entity, id] = key.split(':');
    del.run(tokenId, entity, Number(id));
  }
  return photos;
}

/** Posle spajanja nove osobe dobijaju prave ID-jeve — preostale operacije grane ih moraju pratiti. */
function remapOps(db: DB, tokenId: number, idMap: Map<number, number>): void {
  if (idMap.size === 0) return;
  const swap = (v: unknown) => (typeof v === 'number' && idMap.has(v) ? idMap.get(v) : v);
  const update = db.prepare('UPDATE proposal_ops SET payload = ? WHERE id = ?');
  for (const op of loadOps(db, tokenId)) {
    const p = parsePayload(op);
    let changed = false;
    for (const f of REF_FIELDS) {
      if (p.input && f in p.input) {
        const next = swap(p.input[f]);
        if (next !== p.input[f]) {
          p.input[f] = next;
          changed = true;
        }
      }
      const delta = p.changes?.[f];
      if (delta) {
        const from = swap(delta.from);
        const to = swap(delta.to);
        if (from !== delta.from || to !== delta.to) {
          delta.from = from;
          delta.to = to;
          changed = true;
        }
      }
    }
    if (changed) update.run(JSON.stringify(p), op.id);
  }
}

function deleteUnusedPhotos(db: DB, dataDir: string, photoIds: string[]): void {
  const inPersons = db.prepare('SELECT 1 FROM persons WHERE photo_id = ?');
  const inOps = db.prepare('SELECT 1 FROM proposal_ops WHERE instr(payload, ?) > 0');
  for (const id of new Set(photoIds)) {
    if (!inPersons.get(id) && !inOps.get(id)) deletePhotoFiles(dataDir, id);
  }
}

function topoCreates(creates: BranchChange[]): BranchChange[] {
  const byKey = new Map(creates.map((c) => [c.key, c]));
  const seen = new Set<string>();
  const out: BranchChange[] = [];
  const visit = (c: BranchChange) => {
    if (seen.has(c.key)) return;
    seen.add(c.key);
    for (const d of c.depends_on) {
      const dep = byKey.get(d);
      if (dep) visit(dep);
    }
    out.push(c);
  };
  creates.forEach(visit);
  return out;
}

const str = (v: unknown): string | null => (typeof v === 'string' ? v : null);
const num = (v: unknown): number | null => (typeof v === 'number' ? v : null);

/** Spoji izabrane izmene u glavno stablo — sve u jednoj transakciji, kroz iste servise kao ručni unos. */
export function mergeChanges(db: DB, dataDir: string, tokenId: number, keys: string[]): BranchMergeResult {
  assertTokenExists(db, tokenId);
  const unusedPhotos: string[] = [];

  const result = db.transaction((): BranchMergeResult => {
    const computed = computeChanges(db, tokenId);
    const selected = selectChanges(computed.changes, keys);
    const labelOf = (key: string) => computed.changes.find((c) => c.key === key)?.label ?? key;
    for (const c of selected.values()) {
      if (c.status === 'broken') {
        throw new AppError(409, 'change_broken', `„${c.label}": izmena ne može da se primeni — odbacite je`);
      }
      const missing = c.depends_on.find((d) => !selected.has(d));
      if (missing) {
        throw new AppError(409, 'missing_dependency', `„${c.label}" zavisi od izmene „${labelOf(missing)}" — izaberite i nju`);
      }
    }

    const chosen = computed.changes.filter((c) => selected.has(c.key));
    const idMap = new Map<number, number>();
    const mapRef = (value: unknown): unknown => {
      if (typeof value !== 'number' || !isBranchId(value)) return value;
      const mapped = idMap.get(value);
      if (mapped === undefined) {
        throw new AppError(409, 'missing_dependency', 'Izmena upućuje na osobu koja nije spojena');
      }
      return mapped;
    };
    const apply = (c: BranchChange, fn: (values: Record<string, unknown>) => void) => {
      try {
        fn(Object.fromEntries(c.fields.map((f) => [f.field, REF_FIELDS.has(f.field) ? mapRef(f.to) : f.to])));
      } catch (err) {
        if (err instanceof AppError) throw new AppError(409, 'merge_failed', `„${c.label}": ${err.message}`);
        throw err;
      }
    };
    const pick = (entity: BranchEntity, action: BranchAction) =>
      chosen.filter((c) => c.entity === entity && c.action === action);

    // Redosled: nove osobe (roditelji pre dece) → izmene osoba → brakovi → brisanja.
    for (const c of topoCreates(pick('person', 'create'))) {
      apply(c, (v) => {
        const person = createPerson(db, {
          first_name: String(v.first_name),
          last_name: str(v.last_name) ?? '',
          maiden_name: str(v.maiden_name),
          gender: (str(v.gender) as Gender | null) ?? 'U',
          title: str(v.title),
          birth_date: str(v.birth_date),
          death_date: str(v.death_date),
          birth_place: str(v.birth_place),
          notes: str(v.notes),
          father_id: num(v.father_id),
          mother_id: num(v.mother_id),
        });
        idMap.set(c.entity_id, person.id);
        const extra: Record<string, unknown> = {};
        if (v.is_family_head) extra.is_family_head = true;
        if (str(v.photo_id)) extra.photo_id = v.photo_id;
        if (Object.keys(extra).length > 0) updatePerson(db, person.id, extra as PersonPatch);
      });
    }
    for (const c of pick('person', 'update')) {
      apply(c, (v) => {
        const before = getPerson(db, c.entity_id);
        updatePerson(db, c.entity_id, v as PersonPatch);
        if ('photo_id' in v && before?.photo_id && before.photo_id !== v.photo_id) unusedPhotos.push(before.photo_id);
      });
    }
    for (const c of pick('union', 'create')) {
      apply(c, (v) => {
        createUnion(db, {
          partner1_id: Number(v.partner1_id),
          partner2_id: Number(v.partner2_id),
          type: (str(v.type) as UnionType | null) ?? 'marriage',
          start_date: str(v.start_date),
          end_date: str(v.end_date),
          end_reason: str(v.end_reason) as UnionEndReason | null,
          notes: str(v.notes),
        });
      });
    }
    for (const c of pick('union', 'update')) apply(c, (v) => void updateUnion(db, c.entity_id, v as UnionPatch));
    for (const c of pick('union', 'delete')) apply(c, () => deleteUnion(db, c.entity_id));
    for (const c of pick('person', 'delete')) {
      apply(c, () => {
        const deleted = deletePerson(db, c.entity_id);
        if (deleted.photo_id) unusedPhotos.push(deleted.photo_id);
      });
    }

    unusedPhotos.push(...removeGroups(db, tokenId, [...selected.keys(), ...computed.vanished]));
    remapOps(db, tokenId, idMap);
    clearSubmittedIfEmpty(db, tokenId);
    return { merged: chosen.length };
  })();

  deleteUnusedPhotos(db, dataDir, unusedPhotos);
  return result;
}

/** Odbaci izabrane izmene iz grane (i admin i saradnici). Zavisne izmene moraju biti u izboru. */
export function discardChanges(db: DB, dataDir: string, tokenId: number, keys: string[]): void {
  assertTokenExists(db, tokenId);
  const photos = db.transaction((): string[] => {
    const computed = computeChanges(db, tokenId);
    const selected = selectChanges(computed.changes, keys);
    const dependent = computed.changes.find(
      (c) => !selected.has(c.key) && c.depends_on.some((d) => selected.has(d)),
    );
    if (dependent) {
      throw new AppError(409, 'dependent_changes', `„${dependent.label}" zavisi od izmene koju odbacujete — odbacite i nju`);
    }
    const removed = removeGroups(db, tokenId, [...selected.keys(), ...computed.vanished]);
    clearSubmittedIfEmpty(db, tokenId);
    return removed;
  })();
  deleteUnusedPhotos(db, dataDir, photos);
}
