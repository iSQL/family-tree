/**
 * Provera predloga saradnika — čista logika, bez I/O.
 * Server je pokreće pri slanju i (autoritativno) pri odobravanju; klijent uživo, da
 * saradnik i administrator vide probleme pre nego što pošalju odnosno spoje predlog.
 */
import { foldForSearch } from './search';
import type {
  Gender,
  ParentRole,
  PersonRef,
  PersonSlim,
  ProposalCheck,
  ProposalData,
  ProposalIssue,
  ProposalIssueCode,
  ProposalMerge,
  ProposalRefSnapshot,
  ProposedPerson,
  TreeResponse,
} from './types';

type ProposalRelations = Pick<ProposalData, 'persons' | 'unions' | 'parent_links'>;

/** Referenca razrešena na čvor konačnog stabla (spojena nova osoba = postojeća). */
type Resolved = { kind: 'existing'; id: number } | { kind: 'new'; temp_id: string };

interface Named {
  first_name: string;
  last_name: string;
  gender: Gender;
}

const ROLE_WORD: Record<ParentRole, string> = { father: 'otac', mother: 'majka' };
const ROLE_OBJECT: Record<ParentRole, string> = { father: 'oca', mother: 'majku' };
const SLOT_TAKEN: Record<ParentRole, string> = {
  father: 'već ima upisanog oca',
  mother: 'već ima upisanu majku',
};

export function personName(p: { first_name: string; last_name: string }): string {
  return `${p.first_name} ${p.last_name}`.trim() || '?';
}

const YEAR_RE = /^(\d{4})/;

function birthYear(date: string | null): number | null {
  const m = date ? YEAR_RE.exec(date) : null;
  return m ? Number(m[1]) : null;
}

function nameWithYear(p: PersonSlim): string {
  const year = birthYear(p.birth_date);
  return year === null ? personName(p) : `${personName(p)} (${year})`;
}

const fold = (s: string | null | undefined): string => foldForSearch((s ?? '').trim());

/** Svi ID-jevi postojećih osoba na koje se predlog poziva (roditelji, partneri, deca iz parent_links). */
export function referencedPersonIds(data: ProposalRelations): number[] {
  const ids = new Set<number>();
  const add = (ref: PersonRef | null) => {
    if (typeof ref === 'number') ids.add(ref);
  };
  for (const p of data.persons) {
    add(p.father_id);
    add(p.mother_id);
  }
  for (const u of data.unions) {
    add(u.partner1_id);
    add(u.partner2_id);
  }
  for (const l of data.parent_links) ids.add(l.child_id);
  return [...ids].sort((a, b) => a - b);
}

/** Snimak postojećih osoba iz predloga — pravi ga server u trenutku slanja. */
export function buildRefSnapshot(
  persons: PersonSlim[],
  data: ProposalRelations,
): Record<string, ProposalRefSnapshot> {
  const byId = new Map(persons.map((p) => [p.id, p] as const));
  const refs: Record<string, ProposalRefSnapshot> = {};
  for (const id of referencedPersonIds(data)) {
    const p = byId.get(id);
    if (p) refs[String(id)] = { first_name: p.first_name, last_name: p.last_name, birth_date: p.birth_date };
  }
  return refs;
}

export type DuplicateCandidate = Pick<
  ProposedPerson,
  'first_name' | 'last_name' | 'maiden_name' | 'gender' | 'birth_date'
>;

/**
 * Postojeće osobe koje verovatno predstavljaju istu osobu kao nova: isto ime (bez obzira
 * na dijakritike i pismo), isto prezime ili devojačko prezime, pol se ne kosi i godina
 * rođenja se razlikuje najviše 2 (ako je poznata kod obe).
 */
export function findPossibleDuplicates(
  persons: PersonSlim[],
  candidate: DuplicateCandidate,
  limit = 5,
): PersonSlim[] {
  const first = fold(candidate.first_name);
  if (first === '') return [];
  const candidateSurnames = new Set([fold(candidate.last_name), fold(candidate.maiden_name)].filter(Boolean));
  const candidateYear = birthYear(candidate.birth_date);

  const out: PersonSlim[] = [];
  for (const p of persons) {
    if (fold(p.first_name) !== first) continue;
    if (candidate.gender !== 'U' && p.gender !== 'U' && candidate.gender !== p.gender) continue;
    const surnames = [fold(p.last_name), fold(p.maiden_name)].filter(Boolean);
    // Bez prezimena na obe strane je poklapanje; samo na jednoj — nije (inače bi svaki „Marko" bio duplikat).
    const surnameMatch =
      candidateSurnames.size === 0 || surnames.length === 0
        ? candidateSurnames.size === 0 && surnames.length === 0
        : surnames.some((s) => candidateSurnames.has(s));
    if (!surnameMatch) continue;
    const year = birthYear(p.birth_date);
    if (candidateYear !== null && year !== null && Math.abs(candidateYear - year) > 2) continue;
    out.push(p);
    if (out.length >= limit) break;
  }
  return out;
}

/** Iterativni DFS kroz veze dete → roditelj; vraća čvor na kome je pronađen krug. */
function findCycle(parentEdges: Map<string, string[]>): string | null {
  const state = new Map<string, 'active' | 'done'>();
  for (const start of parentEdges.keys()) {
    if (state.has(start)) continue;
    state.set(start, 'active');
    const stack: { node: string; next: number }[] = [{ node: start, next: 0 }];
    while (stack.length > 0) {
      const top = stack[stack.length - 1]!;
      const parents = parentEdges.get(top.node) ?? [];
      if (top.next < parents.length) {
        const parent = parents[top.next++]!;
        const s = state.get(parent);
        if (s === 'active') return parent;
        if (s === undefined) {
          state.set(parent, 'active');
          stack.push({ node: parent, next: 0 });
        }
      } else {
        state.set(top.node, 'done');
        stack.pop();
      }
    }
  }
  return null;
}

export interface CheckProposalOptions {
  /** Nove osobe koje administrator spaja sa postojećim (ne kreiraju se). */
  merges?: ProposalMerge[];
}

export function checkProposal(
  tree: TreeResponse,
  data: ProposalData,
  options: CheckProposalOptions = {},
): ProposalCheck {
  const issues: ProposalIssue[] = [];
  const add = (
    severity: ProposalIssue['severity'],
    code: ProposalIssueCode,
    message: string,
    extra: Pick<ProposalIssue, 'temp_id' | 'candidate_ids'> = {},
  ) => {
    issues.push({ severity, code, message, ...extra });
  };

  const existing = new Map(tree.persons.map((p) => [p.id, p] as const));
  const proposed = new Map<string, ProposedPerson>();
  for (const p of data.persons) {
    if (proposed.has(p.temp_id)) {
      add('error', 'duplicate_temp_id', `Nova osoba ${personName(p)} je upisana dva puta`, { temp_id: p.temp_id });
    } else {
      proposed.set(p.temp_id, p);
    }
  }

  const merged = new Map<string, number>();
  for (const m of options.merges ?? []) {
    if (!proposed.has(m.temp_id) || !existing.has(m.person_id) || merged.has(m.temp_id)) {
      add('error', 'invalid_merge', 'Spajanje se odnosi na nepostojeću ili već spojenu osobu', {
        temp_id: m.temp_id,
      });
      continue;
    }
    merged.set(m.temp_id, m.person_id);
  }

  /** null = nema reference; undefined = referenca ne pokazuje ni na koga. */
  const resolve = (ref: PersonRef | null): Resolved | null | undefined => {
    if (ref === null) return null;
    if (typeof ref === 'number') return existing.has(ref) ? { kind: 'existing', id: ref } : undefined;
    const target = merged.get(ref);
    if (target !== undefined) return { kind: 'existing', id: target };
    return proposed.has(ref) ? { kind: 'new', temp_id: ref } : undefined;
  };
  const keyOf = (r: Resolved): string => (r.kind === 'existing' ? `e:${r.id}` : `n:${r.temp_id}`);
  const personOf = (r: Resolved): Named =>
    r.kind === 'existing' ? existing.get(r.id)! : proposed.get(r.temp_id)!;
  const labelOfRef = (ref: PersonRef): string => {
    if (typeof ref === 'string') {
      const p = proposed.get(ref);
      return p ? personName(p) : '?';
    }
    const snap = data.refs[String(ref)];
    const current = existing.get(ref);
    return snap ? personName(snap) : current ? personName(current) : `#${ref}`;
  };
  const labelOfKey = (key: string): string => {
    const raw = key.slice(2);
    if (key.startsWith('e:')) {
      const p = existing.get(Number(raw));
      return p ? personName(p) : `#${raw}`;
    }
    const p = proposed.get(raw);
    return p ? personName(p) : '?';
  };

  // 1. Postojeće osobe: da li i dalje postoje i da li su iste kao u trenutku slanja.
  for (const id of referencedPersonIds(data)) {
    const current = existing.get(id);
    const snap = data.refs[String(id)];
    if (!current) {
      add('error', 'missing_person', `Osoba ${snap ? personName(snap) : `#${id}`} više ne postoji u stablu`);
      continue;
    }
    if (!snap) {
      add(
        'warning',
        'unverified_ref',
        `Za osobu ${personName(current)} nema snimka iz trenutka slanja — proverite da li je to prava osoba`,
      );
      continue;
    }
    const snapYear = birthYear(snap.birth_date);
    const currentYear = birthYear(current.birth_date);
    const changed =
      fold(snap.first_name) !== fold(current.first_name) ||
      fold(snap.last_name) !== fold(current.last_name) ||
      (snapYear !== null && currentYear !== null && snapYear !== currentYear);
    if (changed) {
      add(
        'error',
        'stale_ref',
        `Predlog se odnosi na „${personName(snap)}", ali je osoba #${id} sada „${nameWithYear(current)}" — stablo se promenilo od slanja`,
      );
    }
  }

  const checkParent = (
    childLabel: string,
    ref: PersonRef | null,
    role: ParentRole,
    childTemp?: string,
  ): Resolved | null => {
    const extra = childTemp === undefined ? {} : { temp_id: childTemp };
    const r = resolve(ref);
    if (r === null) return null;
    if (r === undefined) {
      // Nepostojeća postojeća osoba je već prijavljena kao missing_person.
      if (typeof ref === 'string') {
        add('error', 'unknown_ref', `${childLabel}: ${ROLE_WORD[role]} ne postoji ni u stablu ni u predlogu`, extra);
      }
      return null;
    }
    if (r.kind === 'new' && r.temp_id === childTemp) {
      add('error', 'self_parent', `${childLabel} ne može biti roditelj sam(a) sebi`, extra);
      return null;
    }
    const gender = personOf(r).gender;
    if ((role === 'father' && gender === 'F') || (role === 'mother' && gender === 'M')) {
      add(
        'error',
        'parent_gender',
        `${personName(personOf(r))} ne može biti ${ROLE_WORD[role]} za: ${childLabel} — pol se ne slaže`,
        extra,
      );
      return null;
    }
    return r;
  };

  // Konačni graf roditeljstva (dete → roditelji) — za proveru krugova.
  const parentEdges = new Map<string, string[]>();
  const addEdge = (child: string, parent: string) => {
    const list = parentEdges.get(child);
    if (list) list.push(parent);
    else parentEdges.set(child, [parent]);
  };
  for (const p of tree.persons) {
    if (p.father_id !== null) addEdge(`e:${p.id}`, `e:${p.father_id}`);
    if (p.mother_id !== null) addEdge(`e:${p.id}`, `e:${p.mother_id}`);
  }

  // 2. Roditelji novih osoba (spojena osoba se ne kreira, pa se njeni roditelji iz predloga ne primenjuju).
  for (const p of proposed.values()) {
    if (merged.has(p.temp_id)) continue;
    const label = personName(p);
    const father = checkParent(label, p.father_id, 'father', p.temp_id);
    const mother = checkParent(label, p.mother_id, 'mother', p.temp_id);
    if (father && mother && keyOf(father) === keyOf(mother)) {
      add('error', 'same_parents', `${label}: otac i majka ne mogu biti ista osoba`, { temp_id: p.temp_id });
    }
    for (const r of [father, mother]) if (r) addEdge(`n:${p.temp_id}`, keyOf(r));
  }

  // 3. Nove osobe kao roditelji postojećih — samo na praznom mestu.
  const slots = new Set<string>();
  for (const link of data.parent_links) {
    const child = existing.get(link.child_id);
    if (!child) continue;
    const label = personName(child);
    const slot = `${link.child_id}:${link.role}`;
    if (slots.has(slot)) {
      add('error', 'parent_slot_taken', `Za osobu ${label} predloženo je više osoba za ${ROLE_OBJECT[link.role]}`);
      continue;
    }
    slots.add(slot);
    const parent = checkParent(label, link.parent_id, link.role);
    if (!parent) continue;
    const currentId = link.role === 'father' ? child.father_id : child.mother_id;
    if (currentId !== null && !(parent.kind === 'existing' && parent.id === currentId)) {
      const current = existing.get(currentId);
      add(
        'error',
        'parent_slot_taken',
        `${label} ${SLOT_TAKEN[link.role]} (${current ? personName(current) : `#${currentId}`})`,
        parent.kind === 'new' ? { temp_id: parent.temp_id } : {},
      );
      continue;
    }
    addEdge(`e:${link.child_id}`, keyOf(parent));
  }

  const cycleAt = findCycle(parentEdges);
  if (cycleAt !== null) {
    add('error', 'cycle', `Veze roditelja prave krug — ${labelOfKey(cycleAt)} bi bio sam svoj predak`);
  }

  // 4. Brakovi.
  const unionKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const knownPairs = new Set(tree.unions.map((u) => unionKey(`e:${u.partner1_id}`, `e:${u.partner2_id}`)));
  for (const u of data.unions) {
    const a = resolve(u.partner1_id);
    const b = resolve(u.partner2_id);
    if (!a || !b) {
      const badTemp = (!a && typeof u.partner1_id === 'string') || (!b && typeof u.partner2_id === 'string');
      if (badTemp) {
        add(
          'error',
          'invalid_union',
          `Brak ${labelOfRef(u.partner1_id)} i ${labelOfRef(u.partner2_id)} upućuje na osobu koje nema u predlogu`,
        );
      }
      continue;
    }
    const ka = keyOf(a);
    const kb = keyOf(b);
    if (ka === kb) {
      add('error', 'invalid_union', `${personName(personOf(a))} ne može biti u braku sam(a) sa sobom`);
      continue;
    }
    const key = unionKey(ka, kb);
    if (knownPairs.has(key)) {
      add(
        'warning',
        'union_exists',
        `Brak ${personName(personOf(a))} i ${personName(personOf(b))} već postoji — neće biti ponovo dodat`,
      );
      continue;
    }
    knownPairs.add(key);
  }

  // 5. Mogući duplikati postojećih osoba.
  for (const p of proposed.values()) {
    if (merged.has(p.temp_id)) continue;
    const duplicates = findPossibleDuplicates(tree.persons, p);
    if (duplicates.length > 0) {
      add(
        'warning',
        'possible_duplicate',
        `${personName(p)} možda već postoji u stablu: ${duplicates.map(nameWithYear).join(', ')}`,
        { temp_id: p.temp_id, candidate_ids: duplicates.map((d) => d.id) },
      );
    }
  }

  // Greške pre upozorenja (sort je stabilan — redosled unutar grupe ostaje).
  issues.sort((x, y) => (x.severity === y.severity ? 0 : x.severity === 'error' ? -1 : 1));
  return { issues, can_approve: !issues.some((i) => i.severity === 'error') };
}
