/**
 * GEDCOM 5.5.1 export — ručni serializer (LINEAGE-LINKED, UTF-8, LF).
 * FAM zapisi = svi unions + roditeljski parovi (i jednoroditeljski)
 * koji nisu pokriveni nekim unionom.
 */
import type { Person, Union } from '@shared/types';

const GEDCOM_MONTHS = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'] as const;
/** Maksimalna dužina vrednosti jednog reda pre CONC preloma. */
const MAX_LINE_VALUE = 200;

/** Parcijalni ISO ('1956-03-15' | '1956-03' | '1956') → GEDCOM datum. */
function isoToGedcomDate(iso: string): string | null {
  const m = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/.exec(iso);
  if (!m) return null;
  const year = m[1] ?? '';
  const monthStr = m[2];
  if (monthStr === undefined) return year;
  const month = GEDCOM_MONTHS[Number(monthStr) - 1];
  if (month === undefined) return null;
  const dayStr = m[3];
  if (dayStr === undefined) return `${month} ${year}`;
  return `${Number(dayStr)} ${month} ${year}`;
}

/** Jednoredna vrednost: '@' dupliran po spec-u, novi redovi nisu dozvoljeni. */
function escapeValue(value: string): string {
  return value.replace(/@/g, '@@').replace(/[\r\n]+/g, ' ');
}

function pushLine(lines: string[], level: number, tag: string, value?: string | null): void {
  lines.push(value ? `${level} ${tag} ${value}` : `${level} ${tag}`);
}

/** NOTE sa CONT za nove redove i CONC za redove duže od MAX_LINE_VALUE. */
function pushNote(lines: string[], level: number, text: string): void {
  const rows = text.replace(/\r\n?/g, '\n').split('\n');
  rows.forEach((row, i) => {
    const chunks: string[] = [];
    if (row.length === 0) chunks.push('');
    else for (let pos = 0; pos < row.length; pos += MAX_LINE_VALUE) chunks.push(row.slice(pos, pos + MAX_LINE_VALUE));
    chunks.forEach((chunk, j) => {
      const tag = j > 0 ? 'CONC' : i === 0 ? 'NOTE' : 'CONT';
      const lvl = i === 0 && j === 0 ? level : level + 1;
      pushLine(lines, lvl, tag, chunk === '' ? undefined : chunk.replace(/@/g, '@@'));
    });
  });
}

interface FamRecord {
  husbId: number | null;
  wifeId: number | null;
  childIds: number[];
  union: Union | null;
}

/** Slotovi po polu: M→HUSB, F→WIFE, U→HUSB ako je partner1 (inače WIFE); sudar → slobodan slot. */
function assignSlots(u: Union, personById: Map<number, Person>): { husbId: number | null; wifeId: number | null } {
  const p1 = personById.get(u.partner1_id);
  const p2 = personById.get(u.partner2_id);
  let husbId: number | null = null;
  let wifeId: number | null = null;
  if (p1) {
    if (p1.gender === 'F') wifeId = p1.id;
    else husbId = p1.id;
  }
  if (p2) {
    const wantsHusb = p2.gender === 'M';
    if (wantsHusb && husbId === null) husbId = p2.id;
    else if (!wantsHusb && wifeId === null) wifeId = p2.id;
    else if (husbId === null) husbId = p2.id;
    else wifeId = p2.id;
  }
  return { husbId, wifeId };
}

export function serializeGedcom(persons: Person[], unions: Union[]): string {
  const personById = new Map(persons.map(p => [p.id, p]));
  const iXref = (id: number): string => `@I${id}@`;

  // --- FAM zapisi: prvo svi unions, pa nepokriveni roditeljski parovi ---
  const fams: FamRecord[] = [];
  const famByPair = new Map<string, FamRecord>();
  const pairKey = (a: number | null, b: number | null): string => {
    if (a !== null && b !== null) return a < b ? `${a}:${b}` : `${b}:${a}`;
    return `${a ?? ''}:${b ?? ''}`;
  };

  for (const u of unions) {
    const { husbId, wifeId } = assignSlots(u, personById);
    const fam: FamRecord = { husbId, wifeId, childIds: [], union: u };
    fams.push(fam);
    const key = pairKey(u.partner1_id, u.partner2_id);
    if (!famByPair.has(key)) famByPair.set(key, fam); // deca para idu u prvi union tog para
  }

  for (const p of persons) {
    if (p.father_id === null && p.mother_id === null) continue;
    const key = pairKey(p.father_id, p.mother_id);
    let fam = famByPair.get(key);
    if (fam === undefined) {
      fam = { husbId: p.father_id, wifeId: p.mother_id, childIds: [], union: null };
      famByPair.set(key, fam);
      fams.push(fam);
    }
    fam.childIds.push(p.id);
  }

  const famXref = (idx: number): string => `@F${idx + 1}@`;
  const famcOfPerson = new Map<number, number>();
  const famsOfPerson = new Map<number, number[]>();
  fams.forEach((fam, idx) => {
    for (const childId of fam.childIds) {
      if (!famcOfPerson.has(childId)) famcOfPerson.set(childId, idx);
    }
    for (const partnerId of [fam.husbId, fam.wifeId]) {
      if (partnerId === null) continue;
      const list = famsOfPerson.get(partnerId);
      if (list) list.push(idx);
      else famsOfPerson.set(partnerId, [idx]);
    }
  });

  const lines: string[] = [];

  // --- HEAD ---
  lines.push('0 HEAD', '1 SOUR family-tree', '1 GEDC', '2 VERS 5.5.1', '2 FORM LINEAGE-LINKED', '1 CHAR UTF-8');

  // --- INDI ---
  for (const p of persons) {
    lines.push(`0 ${iXref(p.id)} INDI`);
    pushLine(lines, 1, 'NAME', `${escapeValue(p.first_name)} /${escapeValue(p.last_name)}/`.trim());
    if (p.maiden_name) {
      pushLine(lines, 1, 'NAME', `${escapeValue(p.first_name)} /${escapeValue(p.maiden_name)}/`.trim());
      pushLine(lines, 2, 'TYPE', 'maiden');
    }
    pushLine(lines, 1, 'SEX', p.gender);
    if (p.title) pushLine(lines, 1, 'TITL', escapeValue(p.title));
    const birthDate = p.birth_date ? isoToGedcomDate(p.birth_date) : null;
    if (birthDate || p.birth_place) {
      pushLine(lines, 1, 'BIRT');
      if (birthDate) pushLine(lines, 2, 'DATE', birthDate);
      if (p.birth_place) pushLine(lines, 2, 'PLAC', escapeValue(p.birth_place));
    }
    const deathDate = p.death_date ? isoToGedcomDate(p.death_date) : null;
    if (deathDate) {
      pushLine(lines, 1, 'DEAT');
      pushLine(lines, 2, 'DATE', deathDate);
    }
    if (p.notes) pushNote(lines, 1, p.notes);
    const famcIdx = famcOfPerson.get(p.id);
    if (famcIdx !== undefined) pushLine(lines, 1, 'FAMC', famXref(famcIdx));
    for (const idx of famsOfPerson.get(p.id) ?? []) pushLine(lines, 1, 'FAMS', famXref(idx));
  }

  // --- FAM ---
  fams.forEach((fam, idx) => {
    lines.push(`0 ${famXref(idx)} FAM`);
    if (fam.husbId !== null && personById.has(fam.husbId)) pushLine(lines, 1, 'HUSB', iXref(fam.husbId));
    if (fam.wifeId !== null && personById.has(fam.wifeId)) pushLine(lines, 1, 'WIFE', iXref(fam.wifeId));
    for (const childId of fam.childIds) pushLine(lines, 1, 'CHIL', iXref(childId));
    const u = fam.union;
    if (u) {
      if (u.type === 'marriage') {
        const date = u.start_date ? isoToGedcomDate(u.start_date) : null;
        if (date) {
          pushLine(lines, 1, 'MARR');
          pushLine(lines, 2, 'DATE', date);
        } else {
          pushLine(lines, 1, 'MARR', 'Y');
        }
      }
      if (u.end_reason === 'divorce') {
        const date = u.end_date ? isoToGedcomDate(u.end_date) : null;
        if (date) {
          pushLine(lines, 1, 'DIV');
          pushLine(lines, 2, 'DATE', date);
        } else {
          pushLine(lines, 1, 'DIV', 'Y');
        }
      }
      if (u.notes) pushNote(lines, 1, u.notes);
    }
  });

  lines.push('0 TRLR');
  return lines.join('\n') + '\n';
}
