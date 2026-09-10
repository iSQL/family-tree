/**
 * Deljeni DTO tipovi — JEDINI ugovor između servera i klijenta.
 * Konvencija: snake_case ključevi, 1:1 sa kolonama u bazi.
 */

export type Gender = 'M' | 'F' | 'U';

/** Osoba kakvu vraća GET /api/tree — dovoljna za stablo, pretragu, rođendane, timeline i kinship. */
export interface PersonSlim {
  id: number;
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  gender: Gender;
  /** Akademsko zvanje: 'dr', 'prof. dr', 'mr'… */
  title: string | null;
  /** Parcijalni ISO datum: 'YYYY' | 'YYYY-MM' | 'YYYY-MM-DD'. */
  birth_date: string | null;
  /** Isti format; null = živ ili nepoznato. */
  death_date: string | null;
  birth_place: string | null;
  /** UUID stem fajlova slike: GET /api/photos/{photo_id}?size=full|thumb. */
  photo_id: string | null;
  father_id: number | null;
  mother_id: number | null;
  /** Ručno označena glava porodice — prikazuje se kao zasebna „loza" (silazna). */
  is_family_head: boolean;
}

/** Pun red iz baze (GET /api/persons/:id, GEDCOM export). */
export interface Person extends PersonSlim {
  notes: string | null;
  gedcom_xref: string | null;
  created_at: string;
  updated_at: string;
}

export type UnionType = 'marriage' | 'partnership';
export type UnionEndReason = 'divorce' | 'death' | 'separation';

/** Brak/partnerstvo — SAMO partnerski odnos; roditeljstvo je nezavisno (father_id/mother_id na osobi). */
export interface Union {
  id: number;
  /** Uvek partner1_id < partner2_id (server kanonizuje). */
  partner1_id: number;
  partner2_id: number;
  type: UnionType;
  /** Datum venčanja (parcijalni ISO) — izvor za godišnjice i timeline. */
  start_date: string | null;
  end_date: string | null;
  end_reason: UnionEndReason | null;
  notes: string | null;
}

/** Odgovor GET /api/tree — ceo graf odjednom. */
export interface TreeResponse {
  persons: PersonSlim[];
  unions: Union[];
}

/** false = rođeni brat/sestra; 'paternal' = po ocu; 'maternal' = po majci. */
export type HalfSibling = false | 'paternal' | 'maternal';

export interface SiblingSlim extends PersonSlim {
  half: HalfSibling;
}

export interface UnionWithPartner extends Union {
  /** Drugi partner iz ugla tražene osobe; null ako je obrisan. */
  partner: PersonSlim | null;
}

/** Odgovor GET /api/persons/:id — pun red + izračunati srodnici. */
export interface PersonDetail extends Person {
  father: PersonSlim | null;
  mother: PersonSlim | null;
  siblings: SiblingSlim[];
  unions: UnionWithPartner[];
  children: PersonSlim[];
}

export type AuthMode = 'password' | 'disabled';

/** Odgovor GET /api/auth/session. Klijent preskače login ekran kad je auth_mode 'disabled'. */
export interface SessionInfo {
  authenticated: boolean;
  auth_mode: AuthMode;
  /** true kad nalog ima pravo samo na pregled — klijent sakriva sve izmene. */
  readonly: boolean;
  /** true kad server pušta čitanje bez prijave (PUBLIC_READ) — neprijavljeni gost može da gleda. */
  public_read: boolean;
}

/** Standardno telo greške za sve /api/* rute. */
export interface ApiErrorBody {
  error: string;
  message?: string;
  /** zod issues kod 400 Bad Request. */
  issues?: unknown;
}

export interface GedcomWarning {
  /** GEDCOM tag koji nije podržan/preuzet, npr. 'SOUR', 'BAPM'. */
  tag: string;
  count: number;
  sample?: string;
}

/** Odgovor POST /api/backup/restore — koliko je vraćeno iz potpune rezervne kopije. */
export interface BackupRestoreResult {
  persons: number;
  unions: number;
  photos: number;
}

/** Odgovor POST /api/gedcom/import (i za dry_run). */
export interface GedcomImportResult {
  persons_created: number;
  unions_created: number;
  /** Broj postojećih osoba uparenih po gedcom_xref (mode=merge). */
  matched: number;
  warnings: GedcomWarning[];
  dry_run: boolean;
}

export type ProposalStatus = 'pending' | 'approved' | 'rejected';

/** Pozivni link za predloge saradnika (administratorski prikaz). */
export interface ProposalToken {
  id: number;
  token: string;
  /** Kome je link namenjen (npr. „Rođaci iz Niša"). */
  label: string;
  created_at: string;
  /** ISO vreme isteka. Rok je obavezan — null postoji samo kod starih zapisa i takav link ne važi. */
  expires_at: string | null;
  revoked: boolean;
  proposal_count: number;
}

/** Odgovor GET /api/proposals/public/tokens/:token — samo ono što saradnik treba da vidi. */
export interface PublicTokenInfo {
  label: string;
  expires_at: string;
}

/**
 * Referenca na osobu unutar predloga: broj = postojeća osoba iz stabla,
 * string = temp_id nove osobe iz istog predloga.
 */
export type PersonRef = number | string;

export type ParentRole = 'father' | 'mother';

/** Nova osoba iz predloga — ista polja kao Person; roditelj može biti i druga nova osoba. */
export interface ProposedPerson {
  temp_id: string;
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  gender: Gender;
  title: string | null;
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  notes: string | null;
  father_id: PersonRef | null;
  mother_id: PersonRef | null;
}

/** Brak iz predloga — partneri mogu biti postojeće ili nove osobe. */
export interface ProposedUnion {
  partner1_id: PersonRef;
  partner2_id: PersonRef;
  type: UnionType;
  start_date: string | null;
  end_date: string | null;
  end_reason: UnionEndReason | null;
  notes: string | null;
}

/** Nova osoba (parent_id = temp_id) postaje otac/majka POSTOJEĆE osobe — samo na praznom mestu. */
export interface ProposedParentLink {
  child_id: number;
  parent_id: string;
  role: ParentRole;
}

/** Kako je postojeća osoba izgledala kad je predlog poslat — otkriva da ID sada pokazuje na nekog drugog. */
export interface ProposalRefSnapshot {
  first_name: string;
  last_name: string;
  birth_date: string | null;
}

/** Sadržaj predloga (kolona proposals.data, JSON). */
export interface ProposalData {
  persons: ProposedPerson[];
  unions: ProposedUnion[];
  parent_links: ProposedParentLink[];
  /** Ključ = ID postojeće osobe. Popunjava server pri slanju — klijentu se ne veruje. */
  refs: Record<string, ProposalRefSnapshot>;
}

export type ProposalIssueCode =
  | 'duplicate_temp_id'
  | 'invalid_merge'
  | 'missing_person'
  | 'stale_ref'
  | 'unverified_ref'
  | 'unknown_ref'
  | 'self_parent'
  | 'same_parents'
  | 'parent_gender'
  | 'parent_slot_taken'
  | 'cycle'
  | 'invalid_union'
  | 'union_exists'
  | 'possible_duplicate';

/** Problem u predlogu. Kod 409/422 grešaka stiže i u ApiErrorBody.issues. */
export interface ProposalIssue {
  /** error = blokira slanje/spajanje; warning = administrator odlučuje. */
  severity: 'error' | 'warning';
  code: ProposalIssueCode;
  message: string;
  /** Nova osoba na koju se problem odnosi. */
  temp_id?: string;
  /** possible_duplicate: postojeće osobe koje liče na novu. */
  candidate_ids?: number[];
}

export interface ProposalCheck {
  issues: ProposalIssue[];
  can_approve: boolean;
}

/** Rešen duplikat: nova osoba iz predloga je zapravo postojeća osoba iz stabla. */
export interface ProposalMerge {
  temp_id: string;
  person_id: number;
}

/** Odgovor POST /api/proposals/:id/approve. */
export interface ProposalApproveResult {
  persons_created: number;
  persons_merged: number;
  parent_links_applied: number;
  unions_created: number;
  unions_skipped: number;
}

export interface Proposal {
  id: number;
  token_id: number | null;
  token_label: string | null;
  author_name: string;
  notes: string | null;
  status: ProposalStatus;
  data: ProposalData;
  created_at: string;
  reviewed_at: string | null;
  review_notes: string | null;
}

export interface ProposalListItem {
  id: number;
  token_id: number | null;
  token_label: string | null;
  author_name: string;
  notes: string | null;
  status: ProposalStatus;
  created_at: string;
  reviewed_at: string | null;
  person_count: number;
  union_count: number;
}

