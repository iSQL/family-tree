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
  /** UUID stem fajlova slike: GET /api/photos/{photo_id}?size=full|thumb. */
  photo_id: string | null;
  father_id: number | null;
  mother_id: number | null;
}

/** Pun red iz baze (GET /api/persons/:id, GEDCOM export). */
export interface Person extends PersonSlim {
  birth_place: string | null;
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

/** Odgovor POST /api/gedcom/import (i za dry_run). */
export interface GedcomImportResult {
  persons_created: number;
  unions_created: number;
  /** Broj postojećih osoba uparenih po gedcom_xref (mode=merge). */
  matched: number;
  warnings: GedcomWarning[];
  dry_run: boolean;
}
