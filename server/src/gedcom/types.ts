/**
 * Ugovor GEDCOM modula — ČISTE funkcije, bez pristupa bazi.
 *
 *  - import.ts MORA da izveze:  parseGedcom(input: Buffer | string): GedcomParseResult
 *  - export.ts MORA da izveze:  serializeGedcom(persons: Person[], unions: Union[]): string
 *    (GEDCOM 5.5.1, UTF-8; FAM zapisi se rekonstruišu iz unions ∪ roditeljskih parova
 *     koji nisu pokriveni unionom)
 *
 * Mapiranje drafta u bazu (xref → id, redosled umetanja, merge po gedcom_xref)
 * radi server sloj (routes/gedcom.ts + services), NE ovaj modul.
 */
import type { Gender, UnionEndReason, UnionType } from '@shared/types';

export interface GedcomPersonDraft {
  /** GEDCOM xref, npr. '@I12@' — čuva se u persons.gedcom_xref radi merge-a. */
  xref: string;
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  gender: Gender;
  title: string | null;
  /** Parcijalni ISO ('YYYY' | 'YYYY-MM' | 'YYYY-MM-DD') ili null ako GEDCOM datum nije prevodiv. */
  birth_date: string | null;
  death_date: string | null;
  birth_place: string | null;
  /** Uklj. tekst „ljudski vrednih" nepodržanih tagova (OCCU, EDUC…) dopisan na kraj. */
  notes: string | null;
  /** xref oca/majke izveden iz FAMC → FAM(HUSB/WIFE); null ako nepoznat. */
  father_xref: string | null;
  mother_xref: string | null;
}

export interface GedcomUnionDraft {
  /** xref partnera (HUSB/WIFE iz FAM zapisa); null ako strana nedostaje. */
  partner1_xref: string | null;
  partner2_xref: string | null;
  type: UnionType;
  start_date: string | null;
  end_date: string | null;
  end_reason: UnionEndReason | null;
  notes: string | null;
}

export interface GedcomParseResult {
  persons: GedcomPersonDraft[];
  unions: GedcomUnionDraft[];
  /** Agregat nepodržanih/odbačenih tagova — NIKAD ne baca zbog nepoznatog taga. */
  warnings: import('@shared/types').GedcomWarning[];
}
