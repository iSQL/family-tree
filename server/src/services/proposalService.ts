/**
 * Predlozi saradnika — „pull request" model za stablo.
 * Pozivni link (token sa obaveznim rokom) → saradnik šalje predlog (JSON snimak) →
 * administrator ga pregleda i spaja. Spajanje ide kroz iste servisne funkcije kao ručni
 * unos (createPerson, updatePerson, createUnion), pa važe iste provere, a sve je u
 * jednoj transakciji — ili se upiše ceo predlog ili ništa.
 */
import crypto from 'node:crypto';
import type { DB } from '../db';
import { buildRefSnapshot, checkProposal } from '@shared/proposalCheck';
import type {
  ApproveProposalInput,
  CreateProposalTokenInput,
  RejectProposalInput,
  SubmitProposalInput,
} from '@shared/schemas';
import type {
  PersonRef,
  Proposal,
  ProposalApproveResult,
  ProposalData,
  ProposalIssue,
  ProposalListItem,
  ProposalStatus,
  ProposalToken,
} from '@shared/types';
import { AppError } from '../middleware/errors';
import { createPerson, getTree, updatePerson } from './personService';
import { createUnion } from './unionService';

/** Najviše predloga na čekanju po jednom linku — sprečava zatrpavanje administratora. */
export const MAX_PENDING_PER_TOKEN = 20;

const DAY_MS = 24 * 60 * 60 * 1000;
const SQLITE_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

/** Stari redovi imaju SQLite datetime('now') bez zone — normalizuj u ISO UTC. */
function toIsoUtc(value: string): string {
  return SQLITE_DATETIME_RE.test(value) ? `${value.replace(' ', 'T')}Z` : value;
}

const errorsOf = (issues: ProposalIssue[]) => issues.filter((i) => i.severity === 'error');

// --- Pozivni linkovi ---

interface TokenRow {
  id: number;
  token: string;
  label: string;
  created_at: string;
  expires_at: string | null;
  revoked: number;
  proposal_count: number;
}

const TOKEN_SELECT = `SELECT t.id, t.token, t.label, t.created_at, t.expires_at, t.revoked,
    (SELECT COUNT(*) FROM proposals p WHERE p.token_id = t.id) AS proposal_count
  FROM proposal_tokens t`;

function toToken(row: TokenRow): ProposalToken {
  return {
    ...row,
    created_at: toIsoUtc(row.created_at),
    expires_at: row.expires_at === null ? null : toIsoUtc(row.expires_at),
    revoked: row.revoked === 1,
  };
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
  return toToken(db.prepare(`${TOKEN_SELECT} WHERE t.id = ?`).get(info.lastInsertRowid) as TokenRow);
}

export function listTokens(db: DB): ProposalToken[] {
  return (db.prepare(`${TOKEN_SELECT} ORDER BY t.id DESC`).all() as TokenRow[]).map(toToken);
}

export function revokeToken(db: DB, id: number): void {
  const info = db.prepare('UPDATE proposal_tokens SET revoked = 1 WHERE id = ?').run(id);
  if (info.changes === 0) throw new AppError(404, 'not_found', 'Link nije pronađen');
}

/** Važeći link: postoji, nije opozvan i rok nije istekao. Link bez roka (stari zapis) ne važi. */
export function requireValidToken(db: DB, tokenStr: string): ProposalToken & { expires_at: string } {
  const row = db.prepare(`${TOKEN_SELECT} WHERE t.token = ? AND t.revoked = 0`).get(tokenStr) as
    | TokenRow
    | undefined;
  const token = row ? toToken(row) : null;
  const expiresAt = token?.expires_at ? Date.parse(token.expires_at) : Number.NaN;
  if (!token || !(expiresAt > Date.now())) {
    throw new AppError(404, 'invalid_token', 'Pozivni link je nevažeći ili je istekao');
  }
  return token as ProposalToken & { expires_at: string };
}

// --- Predlozi ---

interface ProposalRow {
  id: number;
  token_id: number | null;
  token_label: string | null;
  author_name: string;
  notes: string | null;
  status: ProposalStatus;
  data: string;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
}

const PROPOSAL_SELECT = `SELECT p.id, p.token_id, t.label AS token_label, p.author_name, p.notes, p.status,
    p.data, p.created_at, p.reviewed_at, p.review_notes
  FROM proposals p
  LEFT JOIN proposal_tokens t ON t.id = p.token_id`;

/** JSON iz baze → ProposalData; nedostajuća polja (stariji zapisi) dobijaju podrazumevane vrednosti. */
function parseData(raw: string): ProposalData {
  let parsed: Partial<ProposalData> = {};
  try {
    parsed = JSON.parse(raw) as Partial<ProposalData>;
  } catch {
    // oštećen JSON — tretira se kao prazan predlog
  }
  return {
    persons: (parsed.persons ?? []).map((p) => ({
      ...p,
      father_id: p.father_id ?? null,
      mother_id: p.mother_id ?? null,
    })),
    unions: parsed.unions ?? [],
    parent_links: parsed.parent_links ?? [],
    refs: parsed.refs ?? {},
  };
}

function toProposal(row: ProposalRow): Proposal {
  return {
    ...row,
    data: parseData(row.data),
    created_at: toIsoUtc(row.created_at),
    reviewed_at: row.reviewed_at === null ? null : toIsoUtc(row.reviewed_at),
  };
}

export function submitProposal(db: DB, tokenStr: string, input: SubmitProposalInput): { id: number } {
  const token = requireValidToken(db, tokenStr);

  const { n } = db
    .prepare("SELECT COUNT(*) AS n FROM proposals WHERE token_id = ? AND status = 'pending'")
    .get(token.id) as { n: number };
  if (n >= MAX_PENDING_PER_TOKEN) {
    throw new AppError(
      429,
      'too_many_pending',
      'Preko ovog linka već čeka mnogo predloga — sačekajte da ih administrator pregleda',
    );
  }

  // Snimak postojećih osoba pravi server (klijentu se ne veruje) — pri odobravanju otkriva zastarele ID-jeve.
  const tree = getTree(db);
  const relations = { persons: input.persons, unions: input.unions, parent_links: input.parent_links };
  const data: ProposalData = { ...relations, refs: buildRefSnapshot(tree.persons, relations) };
  const errors = errorsOf(checkProposal(tree, data).issues);
  if (errors.length > 0) throw new AppError(422, 'invalid_proposal', errors[0]!.message, errors);

  const info = db
    .prepare(
      `INSERT INTO proposals (token_id, author_name, notes, status, data, created_at)
       VALUES (?, ?, ?, 'pending', ?, ?)`,
    )
    .run(token.id, input.author_name, input.notes, JSON.stringify(data), new Date().toISOString());
  return { id: Number(info.lastInsertRowid) };
}

export function listProposals(db: DB, status?: ProposalStatus): ProposalListItem[] {
  const rows = db
    .prepare(`${PROPOSAL_SELECT} WHERE (@status IS NULL OR p.status = @status) ORDER BY p.id DESC`)
    .all({ status: status ?? null }) as ProposalRow[];
  return rows.map((row) => {
    const p = toProposal(row);
    return {
      id: p.id,
      token_id: p.token_id,
      token_label: p.token_label,
      author_name: p.author_name,
      notes: p.notes,
      status: p.status,
      created_at: p.created_at,
      reviewed_at: p.reviewed_at,
      person_count: p.data.persons.length,
      union_count: p.data.unions.length,
    };
  });
}

export function getPendingProposalsCount(db: DB): number {
  const row = db.prepare("SELECT COUNT(*) AS n FROM proposals WHERE status = 'pending'").get() as { n: number };
  return row.n;
}

export function getProposal(db: DB, id: number): Proposal | null {
  const row = db.prepare(`${PROPOSAL_SELECT} WHERE p.id = ?`).get(id) as ProposalRow | undefined;
  return row ? toProposal(row) : null;
}

function requirePending(db: DB, id: number): Proposal {
  const proposal = getProposal(db, id);
  if (!proposal) throw new AppError(404, 'not_found', 'Predlog nije pronađen');
  if (proposal.status !== 'pending') throw new AppError(409, 'not_pending', 'Predlog je već pregledan');
  return proposal;
}

export function approveProposal(db: DB, id: number, input: ApproveProposalInput): ProposalApproveResult {
  return db.transaction((): ProposalApproveResult => {
    const { data } = requirePending(db, id);

    // Autoritativna provera nad trenutnim stablom — stablo se moglo promeniti od slanja.
    const errors = errorsOf(checkProposal(getTree(db), data, { merges: input.merges }).issues);
    if (errors.length > 0) throw new AppError(409, 'proposal_conflict', errors[0]!.message, errors);

    const ids = new Map<string, number>(input.merges.map((m) => [m.temp_id, m.person_id]));
    const idOf = (ref: PersonRef): number => {
      const resolved = typeof ref === 'number' ? ref : ids.get(ref);
      if (resolved === undefined) {
        throw new AppError(409, 'proposal_conflict', 'Predlog upućuje na osobu koja nije upisana');
      }
      return resolved;
    };
    const isReady = (ref: PersonRef | null) => typeof ref !== 'string' || ids.has(ref);

    // Nove osobe redom tako da su roditelji iz predloga već upisani (provera je isključila krugove).
    let pending = data.persons.filter((p) => !ids.has(p.temp_id));
    let personsCreated = 0;
    while (pending.length > 0) {
      const ready = pending.filter((p) => isReady(p.father_id) && isReady(p.mother_id));
      if (ready.length === 0) {
        throw new AppError(409, 'proposal_conflict', 'Veze roditelja u predlogu prave krug');
      }
      for (const p of ready) {
        const created = createPerson(db, {
          first_name: p.first_name,
          last_name: p.last_name,
          maiden_name: p.maiden_name,
          gender: p.gender,
          title: p.title,
          birth_date: p.birth_date,
          death_date: p.death_date,
          birth_place: p.birth_place,
          notes: p.notes,
          father_id: p.father_id === null ? null : idOf(p.father_id),
          mother_id: p.mother_id === null ? null : idOf(p.mother_id),
        });
        ids.set(p.temp_id, created.id);
        personsCreated++;
      }
      pending = pending.filter((p) => !ids.has(p.temp_id));
    }

    // Nove osobe kao roditelji postojećih — updatePerson ponovo proverava krugove.
    for (const link of data.parent_links) {
      const parentId = idOf(link.parent_id);
      updatePerson(db, link.child_id, link.role === 'father' ? { father_id: parentId } : { mother_id: parentId });
    }

    const unionExists = db.prepare('SELECT 1 FROM unions WHERE partner1_id = ? AND partner2_id = ?');
    let unionsCreated = 0;
    let unionsSkipped = 0;
    for (const u of data.unions) {
      const a = idOf(u.partner1_id);
      const b = idOf(u.partner2_id);
      if (unionExists.get(Math.min(a, b), Math.max(a, b))) {
        unionsSkipped++;
        continue;
      }
      createUnion(db, {
        partner1_id: a,
        partner2_id: b,
        type: u.type,
        start_date: u.start_date,
        end_date: u.end_date,
        end_reason: u.end_reason,
        notes: u.notes,
      });
      unionsCreated++;
    }

    db.prepare("UPDATE proposals SET status = 'approved', reviewed_at = ? WHERE id = ?").run(
      new Date().toISOString(),
      id,
    );

    return {
      persons_created: personsCreated,
      persons_merged: input.merges.length,
      parent_links_applied: data.parent_links.length,
      unions_created: unionsCreated,
      unions_skipped: unionsSkipped,
    };
  })();
}

export function rejectProposal(db: DB, id: number, input: RejectProposalInput): void {
  requirePending(db, id);
  db.prepare("UPDATE proposals SET status = 'rejected', reviewed_at = ?, review_notes = ? WHERE id = ?").run(
    new Date().toISOString(),
    input.review_notes,
    id,
  );
}
