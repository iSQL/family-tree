/**
 * Nacrt predloga saradnika: čuvanje u localStorage, spajanje sa stablom za prikaz i opis
 * veza nove osobe. Provera ispravnosti je deljena — @shared/proposalCheck.
 */
import { z } from 'zod';
import { buildRefSnapshot } from '@shared/proposalCheck';
import { proposedParentLinkSchema, proposedPersonSchema, proposedUnionSchema } from '@shared/schemas';
import type {
  Gender,
  PersonRef,
  PersonSlim,
  ProposalData,
  ProposedParentLink,
  ProposedPerson,
  ProposedUnion,
  TreeResponse,
  Union,
} from '@shared/types';
import { formatPartialDate } from './dates';
import { STR } from './strings';

export interface ProposalDraft {
  persons: ProposedPerson[];
  unions: ProposedUnion[];
  parent_links: ProposedParentLink[];
  author_name: string;
  notes: string;
}

export type ProposalRelations = Pick<ProposalData, 'persons' | 'unions' | 'parent_links'>;

export const EMPTY_DRAFT: ProposalDraft = { persons: [], unions: [], parent_links: [], author_name: '', notes: '' };

// Zapis iz localStorage se validira — oštećen ili zastareo deo se tiho odbacuje.
const storedDraftSchema = z.object({
  persons: z.array(proposedPersonSchema).catch([]),
  unions: z.array(proposedUnionSchema).catch([]),
  parent_links: z.array(proposedParentLinkSchema).catch([]),
  author_name: z.string().catch(''),
  notes: z.string().catch(''),
});

export function loadDraft(key: string): ProposalDraft {
  try {
    const raw = localStorage.getItem(key);
    return raw ? storedDraftSchema.parse(JSON.parse(raw)) : EMPTY_DRAFT;
  } catch {
    return EMPTY_DRAFT;
  }
}

export function saveDraft(key: string, draft: ProposalDraft): void {
  try {
    const empty = draft.persons.length === 0 && draft.author_name === '' && draft.notes === '';
    if (empty) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify(draft));
  } catch {
    // privatni režim ili pun storage — nacrt živi samo u memoriji
  }
}

export function newTempId(): string {
  return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

/** Isto što server sačuva pri slanju — za proveru uživo na klijentu. */
export function draftToData(tree: TreeResponse, draft: ProposalRelations): ProposalData {
  const relations = { persons: draft.persons, unions: draft.unions, parent_links: draft.parent_links };
  return { ...relations, refs: buildRefSnapshot(tree.persons, relations) };
}

/** Negativni ID-jevi za nove osobe — stablo (f3) radi sa brojevima, a pravi ID-jevi su pozitivni. */
export function nodeIdMap(persons: ProposedPerson[]): Map<string, number> {
  return new Map(persons.map((p, i) => [p.temp_id, -(i + 1)]));
}

/** Postojeće stablo + nove osobe, predloženi roditelji i brakovi — samo za prikaz. */
export function combineTree(
  tree: TreeResponse,
  relations: ProposalRelations,
  nodeIds: Map<string, number>,
): TreeResponse {
  const toNode = (ref: PersonRef | null): number | null =>
    ref === null ? null : typeof ref === 'number' ? ref : (nodeIds.get(ref) ?? null);

  const linkedParents = new Map<number, { father_id?: number; mother_id?: number }>();
  for (const link of relations.parent_links) {
    const parentNode = nodeIds.get(link.parent_id);
    if (parentNode === undefined) continue;
    const entry = linkedParents.get(link.child_id) ?? {};
    entry[link.role === 'father' ? 'father_id' : 'mother_id'] = parentNode;
    linkedParents.set(link.child_id, entry);
  }

  const existing = tree.persons.map((p) => {
    const linked = linkedParents.get(p.id);
    return linked ? { ...p, ...linked } : p;
  });

  const proposed: PersonSlim[] = relations.persons.map((p) => ({
    id: nodeIds.get(p.temp_id)!,
    first_name: p.first_name,
    last_name: p.last_name,
    maiden_name: p.maiden_name,
    gender: p.gender,
    title: p.title,
    birth_date: p.birth_date,
    death_date: p.death_date,
    birth_place: p.birth_place,
    photo_id: null,
    father_id: toNode(p.father_id),
    mother_id: toNode(p.mother_id),
    is_family_head: false,
  }));

  const unions: Union[] = [];
  relations.unions.forEach((u, i) => {
    const a = toNode(u.partner1_id);
    const b = toNode(u.partner2_id);
    if (a === null || b === null) return;
    unions.push({
      id: -(i + 1),
      partner1_id: Math.min(a, b),
      partner2_id: Math.max(a, b),
      type: u.type,
      start_date: u.start_date,
      end_date: u.end_date,
      end_reason: u.end_reason,
      notes: u.notes,
    });
  });

  return { persons: [...existing, ...proposed], unions: [...tree.unions, ...unions] };
}

/** Ukloni osobu iz nacrta zajedno sa njenim vezama (brakovi, roditeljstvo). */
export function removeProposedPerson(draft: ProposalDraft, tempId: string): ProposalDraft {
  const clear = (ref: PersonRef | null) => (ref === tempId ? null : ref);
  return {
    ...draft,
    persons: draft.persons
      .filter((p) => p.temp_id !== tempId)
      .map((p) => ({ ...p, father_id: clear(p.father_id), mother_id: clear(p.mother_id) })),
    unions: draft.unions.filter((u) => u.partner1_id !== tempId && u.partner2_id !== tempId),
    parent_links: draft.parent_links.filter((l) => l.parent_id !== tempId),
  };
}

export function genderLabel(gender: Gender): string {
  return gender === 'M' ? STR.person.genderM : gender === 'F' ? STR.person.genderF : STR.person.genderU;
}

/** 'rođ. 15.03.1956. · Niš · um. 2020.' */
export function formatProposedLife(p: Pick<ProposedPerson, 'birth_date' | 'death_date' | 'birth_place'>): string {
  const parts: string[] = [];
  if (p.birth_date) parts.push(`${STR.proposals.born} ${formatPartialDate(p.birth_date)}`);
  if (p.birth_place) parts.push(p.birth_place);
  if (p.death_date) parts.push(`${STR.proposals.died} ${formatPartialDate(p.death_date)}`);
  return parts.join(' · ');
}

/** Redovi opisa veza nove osobe: roditelji, supružnici, deca (nove i postojeće osobe). */
export function describeRelations(
  relations: ProposalRelations,
  person: ProposedPerson,
  nameOf: (ref: PersonRef) => string,
): string[] {
  const lines: string[] = [];
  const parents = [
    person.father_id !== null ? `${STR.person.father}: ${nameOf(person.father_id)}` : null,
    person.mother_id !== null ? `${STR.person.mother}: ${nameOf(person.mother_id)}` : null,
  ].filter((line): line is string => line !== null);
  if (parents.length > 0) lines.push(parents.join(' · '));

  const spouses = relations.unions
    .filter((u) => u.partner1_id === person.temp_id || u.partner2_id === person.temp_id)
    .map((u) => nameOf(u.partner1_id === person.temp_id ? u.partner2_id : u.partner1_id));
  if (spouses.length > 0) lines.push(`${STR.proposals.spouseOf}: ${spouses.join(', ')}`);

  const children = [
    ...relations.parent_links.filter((l) => l.parent_id === person.temp_id).map((l) => nameOf(l.child_id)),
    ...relations.persons
      .filter((p) => p.father_id === person.temp_id || p.mother_id === person.temp_id)
      .map((p) => nameOf(p.temp_id)),
  ];
  if (children.length > 0) lines.push(`${STR.proposals.parentOf}: ${children.join(', ')}`);

  return lines.length > 0 ? lines : [STR.proposals.independentBranch];
}
