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
  /** Režim predloga (pozivni link) — null kad sesija radi nad glavnim stablom. */
  branch: BranchSessionInfo | null;
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

// --- Predlozi rođaka: pozivni link = grana izmena koju administrator spaja ---

/** Pozivni link (administratorski prikaz). */
export interface ProposalToken {
  id: number;
  token: string;
  /** Kome je link namenjen (npr. „Rođaci iz Niša"). */
  label: string;
  created_at: string;
  expires_at: string;
  revoked: boolean;
  /** Broj izmena u grani koje čekaju pregled. */
  change_count: number;
  /** Kad je grana poslata na odobrenje (null = nije poslata ili je sve pregledano). */
  submitted_at: string | null;
  submitted_by: string | null;
  submit_note: string | null;
}

/** Odgovor GET /api/proposals/public/tokens/:token — samo ono što saradnik treba da vidi. */
export interface PublicTokenInfo {
  label: string;
  expires_at: string;
}

/** Režim predloga u sesiji: izmene idu u granu linka, a ne u glavno stablo. */
export interface BranchSessionInfo {
  token_id: number;
  label: string;
  expires_at: string;
  /** Ime koje je saradnik uneo — vidi se uz njegove izmene. */
  author_name: string;
  submitted_at: string | null;
}

export type BranchEntity = 'person' | 'union';
export type BranchAction = 'create' | 'update' | 'delete';

/** Jedno polje izmene: vrednost pre izmene, u grani i trenutno u glavnom stablu. */
export interface BranchFieldChange {
  field: string;
  from: unknown;
  to: unknown;
  current: unknown;
  /** Polje je u međuvremenu promenjeno u glavnom stablu (na nešto treće). */
  conflict: boolean;
}

/** ok = može da se spoji; conflict = glavno stablo se promenilo pa admin odlučuje; broken = ne može da se primeni. */
export type BranchChangeStatus = 'ok' | 'conflict' | 'broken';

/** Neto izmena jedne osobe ili braka u grani. */
export interface BranchChange {
  /** 'person:12' | 'union:3' — ID-jevi ≥ 1.000.000.000 su osobe/brakovi napravljeni u grani. */
  key: string;
  entity: BranchEntity;
  entity_id: number;
  action: BranchAction;
  label: string;
  fields: BranchFieldChange[];
  status: BranchChangeStatus;
  /** Zašto izmena ne može da se primeni ili zašto je konflikt. */
  problems: string[];
  /** Npr. mogući duplikat postojeće osobe — ne blokira. */
  warnings: string[];
  /** Ključevi izmena koje moraju biti spojene zajedno sa ovom (npr. nova osoba koja je roditelj). */
  depends_on: string[];
  authors: string[];
  updated_at: string;
}

export interface BranchChangesResponse {
  changes: BranchChange[];
  /** Imena osoba na koje upućuju polja (roditelji, partneri) — ključ je ID. */
  person_labels: Record<string, string>;
}

export interface BranchMergeResult {
  merged: number;
}

