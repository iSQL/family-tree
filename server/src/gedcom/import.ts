/**
 * GEDCOM import — čiste funkcije, bez baze.
 * Dekodiranje i tokenizaciju radi read-gedcom (auto-detekcija charseta,
 * CONT/CONC se inline-uju u vrednost), a mapiranje na draft tipove radimo
 * ručnim obilaskom sirovog stabla. Nepoznati tagovi NIKAD ne bacaju —
 * agregiraju se u warnings.
 */
import { parseGedcom as readGedcomTree } from 'read-gedcom';
import type { TreeNode } from 'read-gedcom';
import type { Gender, GedcomWarning, UnionEndReason } from '@shared/types';
import type { GedcomParseResult, GedcomPersonDraft, GedcomUnionDraft } from './types';

// ---------- agregacija upozorenja ----------

class WarningAggregator {
  private byTag = new Map<string, { count: number; sample?: string }>();

  add(tag: string, sample?: string): void {
    const entry = this.byTag.get(tag);
    if (entry) {
      entry.count += 1;
      if (entry.sample === undefined && sample !== undefined) entry.sample = sample;
    } else {
      this.byTag.set(tag, { count: 1, sample });
    }
  }

  toArray(): GedcomWarning[] {
    return [...this.byTag.entries()].map(([tag, { count, sample }]) =>
      sample === undefined ? { tag, count } : { tag, count, sample },
    );
  }
}

// ---------- ulaz ----------

function toArrayBuffer(input: Buffer | string): ArrayBuffer {
  const bytes: Uint8Array = typeof input === 'string' ? new TextEncoder().encode(input) : input;
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

// ---------- datumi ----------

const MONTHS: Record<string, string> = {
  JAN: '01', FEB: '02', MAR: '03', APR: '04', MAY: '05', JUN: '06',
  JUL: '07', AUG: '08', SEP: '09', OCT: '10', NOV: '11', DEC: '12',
};

function plainDateToIso(text: string): string | null {
  let m = /^(\d{1,2})\s+([A-Z]+)\s+(\d{4})$/.exec(text);
  if (m) {
    const day = Number(m[1]);
    const month = MONTHS[m[2] ?? ''];
    if (month === undefined || day < 1 || day > 31) return null;
    return `${m[3]}-${month}-${String(day).padStart(2, '0')}`;
  }
  m = /^([A-Z]+)\s+(\d{4})$/.exec(text);
  if (m) {
    const month = MONTHS[m[1] ?? ''];
    return month === undefined ? null : `${m[2]}-${month}`;
  }
  m = /^\d{4}$/.exec(text);
  if (m) return m[0];
  return null;
}

/** GEDCOM datum → parcijalni ISO; opseg/nevalidno → null uz warning. */
function gedcomDateToIso(raw: string | null, warnings: WarningAggregator): string | null {
  if (raw === null) return null;
  const original = raw.trim();
  if (original === '') return null;
  let text = original.toUpperCase();

  const range = /^(BEF|AFT|BET|FROM|TO)\b/.exec(text);
  if (range) {
    warnings.add(range[1] ?? 'DATE', original);
    return null;
  }

  let qualifier: string | null = null;
  const qual = /^(ABT|EST|CAL)\.?\s+/.exec(text);
  if (qual) {
    qualifier = qual[1] ?? null;
    text = text.slice(qual[0].length);
  }

  const iso = plainDateToIso(text.trim());
  if (iso === null) {
    warnings.add('DATE', original);
    return null;
  }
  if (qualifier !== null) warnings.add(qualifier, original);
  return iso;
}

// ---------- imena ----------

interface ParsedName {
  given: string;
  surname: string | null;
  isMaiden: boolean;
}

function splitNameValue(value: string | null): { given: string; surname: string | null } {
  if (!value) return { given: '', surname: null };
  const m = /^([^/]*)(?:\/([^/]*)\/)?/.exec(value);
  if (!m) return { given: value.trim(), surname: null };
  const rawSurname = m[2];
  return {
    given: (m[1] ?? '').trim(),
    surname: rawSurname === undefined ? null : rawSurname.trim(),
  };
}

function parseNameNode(node: TreeNode, warnings: WarningAggregator, notesParts: string[]): ParsedName {
  const { given, surname } = splitNameValue(node.value);
  let givn: string | undefined;
  let surn: string | undefined;
  let isMaiden = false;
  for (const sub of node.children) {
    switch (sub.tag) {
      case 'GIVN':
        givn = sub.value?.trim();
        break;
      case 'SURN':
        surn = sub.value?.trim();
        break;
      case 'TYPE':
        if ((sub.value ?? '').trim().toLowerCase() === 'maiden') isMaiden = true;
        break;
      case 'NICK': {
        const text = sub.value?.trim();
        if (text) notesParts.push(`Nadimak: ${text}`);
        break;
      }
      default:
        warnings.add(sub.tag ?? '?', sub.value ?? undefined);
    }
  }
  return { given: given || givn || '', surname: surname ?? surn ?? null, isMaiden };
}

// ---------- napomene ----------

/** Inline NOTE ili referenca na level-0 NOTE zapis (@N..@). */
function resolveNote(
  node: TreeNode,
  noteRecords: Map<string, string>,
  warnings: WarningAggregator,
): string | null {
  for (const sub of node.children) {
    // CONT/CONC su već inline-ovani u value; ostalo (SOUR…) ne podržavamo
    warnings.add(sub.tag ?? '?', sub.value ?? undefined);
  }
  const value = node.value;
  if (value === null) return null;
  const trimmed = value.trim();
  if (/^@[^@]+@$/.test(trimmed)) {
    const referenced = noteRecords.get(trimmed);
    if (referenced !== undefined) return referenced;
    warnings.add('NOTE', trimmed);
    return null;
  }
  return value;
}

// ---------- INDI ----------

const NOTES_LABEL = {
  OCCU: 'Zanimanje',
  EDUC: 'Obrazovanje',
  RELI: 'Veroispovest',
  NICK: 'Nadimak',
} as const;

interface ParsedIndi {
  draft: GedcomPersonDraft;
  famc: string | null;
}

function parseIndividual(
  node: TreeNode,
  xref: string,
  noteRecords: Map<string, string>,
  warnings: WarningAggregator,
): ParsedIndi {
  const names: ParsedName[] = [];
  let gender: Gender = 'U';
  let title: string | null = null;
  let birthDate: string | null = null;
  let deathDate: string | null = null;
  let birthPlace: string | null = null;
  let famc: string | null = null;
  const notesParts: string[] = [];

  for (const child of node.children) {
    switch (child.tag) {
      case 'NAME':
        names.push(parseNameNode(child, warnings, notesParts));
        break;
      case 'SEX':
        gender = child.value === 'M' || child.value === 'F' ? child.value : 'U';
        break;
      case 'TITL':
        title = child.value?.trim() || null;
        break;
      case 'BIRT':
        for (const sub of child.children) {
          if (sub.tag === 'DATE') birthDate = gedcomDateToIso(sub.value, warnings);
          else if (sub.tag === 'PLAC') birthPlace = sub.value?.trim() || null;
          else warnings.add(sub.tag ?? '?', sub.value ?? undefined);
        }
        break;
      case 'DEAT':
        for (const sub of child.children) {
          if (sub.tag === 'DATE') deathDate = gedcomDateToIso(sub.value, warnings);
          else warnings.add(sub.tag ?? '?', sub.value ?? undefined);
        }
        break;
      case 'FAMC':
        // roditelji se izvode iz PRVOG FAMC; ostale prijavljujemo
        if (famc === null) famc = child.value ?? null;
        else warnings.add('FAMC', child.value ?? undefined);
        break;
      case 'FAMS':
        break; // pokriveno kroz FAM zapise
      case 'OCCU':
      case 'EDUC':
      case 'RELI':
      case 'NICK': {
        const text = child.value?.trim();
        if (text) notesParts.push(`${NOTES_LABEL[child.tag]}: ${text}`);
        break;
      }
      case 'NOTE': {
        const text = resolveNote(child, noteRecords, warnings);
        if (text) notesParts.push(text);
        break;
      }
      default:
        warnings.add(child.tag ?? '?', child.value ?? undefined);
    }
  }

  const primary = names.find(n => !n.isMaiden) ?? names[0];
  let maiden: string | null = names.find(n => n.isMaiden)?.surname ?? null;
  if (maiden === null && names.length > 1) {
    // drugi NAME (koji nije primarni) tumačimo kao devojačko prezime
    const second = names.find(n => n !== primary);
    maiden = second?.surname ?? null;
  }
  if (maiden !== null && maiden.trim() === '') maiden = null;

  const draft: GedcomPersonDraft = {
    xref,
    first_name: primary?.given ?? '',
    last_name: primary?.surname ?? '',
    maiden_name: maiden,
    gender,
    title,
    birth_date: birthDate,
    death_date: deathDate,
    birth_place: birthPlace,
    notes: notesParts.length > 0 ? notesParts.join('\n') : null,
    father_xref: null,
    mother_xref: null,
  };
  return { draft, famc };
}

// ---------- FAM ----------

interface ParsedFam {
  husb: string | null;
  wife: string | null;
  children: string[];
  union: GedcomUnionDraft | null;
}

function parseFamily(
  node: TreeNode,
  noteRecords: Map<string, string>,
  warnings: WarningAggregator,
): ParsedFam {
  let husb: string | null = null;
  let wife: string | null = null;
  const children: string[] = [];
  let hasMarr = false;
  let startDate: string | null = null;
  let endDate: string | null = null;
  let endReason: UnionEndReason | null = null;
  const notesParts: string[] = [];

  for (const child of node.children) {
    switch (child.tag) {
      case 'HUSB':
        husb = child.value ?? null;
        break;
      case 'WIFE':
        wife = child.value ?? null;
        break;
      case 'CHIL':
        if (child.value) children.push(child.value);
        break;
      case 'MARR':
        hasMarr = true;
        for (const sub of child.children) {
          if (sub.tag === 'DATE') startDate = gedcomDateToIso(sub.value, warnings);
          else warnings.add(sub.tag ?? '?', sub.value ?? undefined);
        }
        break;
      case 'DIV':
        endReason = 'divorce';
        for (const sub of child.children) {
          if (sub.tag === 'DATE') endDate = gedcomDateToIso(sub.value, warnings);
          else warnings.add(sub.tag ?? '?', sub.value ?? undefined);
        }
        break;
      case 'NOTE': {
        const text = resolveNote(child, noteRecords, warnings);
        if (text) notesParts.push(text);
        break;
      }
      default:
        warnings.add(child.tag ?? '?', child.value ?? undefined);
    }
  }

  const union: GedcomUnionDraft | null =
    husb !== null || wife !== null
      ? {
          partner1_xref: husb,
          partner2_xref: wife,
          type: hasMarr ? 'marriage' : 'partnership',
          start_date: startDate,
          end_date: endDate,
          end_reason: endReason,
          notes: notesParts.length > 0 ? notesParts.join('\n') : null,
        }
      : null;
  return { husb, wife, children, union };
}

// ---------- glavna funkcija ----------

export function parseGedcom(input: Buffer | string): GedcomParseResult {
  const root = readGedcomTree(toArrayBuffer(input), { noIndex: true });
  const warnings = new WarningAggregator();

  // level-0 NOTE zapisi (pointer → tekst) za razrešavanje referenci
  const noteRecords = new Map<string, string>();
  for (const rec of root.children) {
    if (rec.tag === 'NOTE' && rec.pointer) noteRecords.set(rec.pointer, rec.value ?? '');
  }

  const persons: GedcomPersonDraft[] = [];
  const unions: GedcomUnionDraft[] = [];
  const famcByPerson = new Map<string, string>();
  const famByXref = new Map<string, ParsedFam>();
  const allFams: ParsedFam[] = [];

  for (const rec of root.children) {
    switch (rec.tag) {
      case 'HEAD':
      case 'TRLR':
      case 'NOTE': // obrađeno gore
        break;
      case 'INDI': {
        if (!rec.pointer) break; // INDI bez xref-a je neupotrebljiv
        const { draft, famc } = parseIndividual(rec, rec.pointer, noteRecords, warnings);
        persons.push(draft);
        if (famc !== null) famcByPerson.set(draft.xref, famc);
        break;
      }
      case 'FAM': {
        const fam = parseFamily(rec, noteRecords, warnings);
        allFams.push(fam);
        if (rec.pointer) famByXref.set(rec.pointer, fam);
        if (fam.union) unions.push(fam.union);
        break;
      }
      default:
        warnings.add(rec.tag ?? '?', rec.value ?? rec.pointer ?? undefined);
    }
  }

  // roditelji: prvi FAMC; fallback = prvi FAM u kome je osoba navedena kao CHIL
  const famOfChild = new Map<string, ParsedFam>();
  for (const fam of allFams) {
    for (const childXref of fam.children) {
      if (!famOfChild.has(childXref)) famOfChild.set(childXref, fam);
    }
  }
  for (const draft of persons) {
    const famcXref = famcByPerson.get(draft.xref);
    let fam = famcXref !== undefined ? famByXref.get(famcXref) : undefined;
    if (famcXref !== undefined && fam === undefined) warnings.add('FAMC', famcXref);
    if (fam === undefined) fam = famOfChild.get(draft.xref);
    if (fam !== undefined) {
      draft.father_xref = fam.husb;
      draft.mother_xref = fam.wife;
    }
  }

  return { persons, unions, warnings: warnings.toArray() };
}
