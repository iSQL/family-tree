import { describe, expect, it } from 'vitest';
import { buildRefSnapshot, checkProposal, findPossibleDuplicates } from './proposalCheck';
import type { PersonSlim, ProposalCheck, ProposalData, ProposedPerson, TreeResponse } from './types';

function person(id: number, first_name: string, extra: Partial<PersonSlim> = {}): PersonSlim {
  return {
    id,
    first_name,
    last_name: 'Petrović',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    photo_id: null,
    father_id: null,
    mother_id: null,
    is_family_head: false,
    ...extra,
  };
}

function proposed(temp_id: string, first_name: string, extra: Partial<ProposedPerson> = {}): ProposedPerson {
  return {
    temp_id,
    first_name,
    last_name: 'Petrović',
    maiden_name: null,
    gender: 'U',
    title: null,
    birth_date: null,
    death_date: null,
    birth_place: null,
    notes: null,
    father_id: null,
    mother_id: null,
    ...extra,
  };
}

/** Predlog sa snimkom postojećih osoba iz `tree` (kao što ga pravi server pri slanju). */
function proposal(tree: TreeResponse, relations: Partial<Omit<ProposalData, 'refs'>>): ProposalData {
  const base = { persons: [], unions: [], parent_links: [], ...relations };
  return { ...base, refs: buildRefSnapshot(tree.persons, base) };
}

const codes = (check: ProposalCheck) => check.issues.map((i) => `${i.severity}:${i.code}`);

describe('checkProposal', () => {
  const tree: TreeResponse = {
    persons: [
      person(1, 'Petar', { gender: 'M', birth_date: '1940' }),
      person(2, 'Mara', { gender: 'F', birth_date: '1945' }),
      person(3, 'Jovan', { gender: 'M', birth_date: '1970', father_id: 1 }),
    ],
    unions: [{ id: 1, partner1_id: 1, partner2_id: 2, type: 'marriage', start_date: null, end_date: null, end_reason: null, notes: null }],
  };

  it('ispravan predlog (dete postojećih roditelja) nema problema', () => {
    const data = proposal(tree, { persons: [proposed('n1', 'Ana', { gender: 'F', father_id: 1, mother_id: 2 })] });
    expect(checkProposal(tree, data)).toEqual({ issues: [], can_approve: true });
  });

  it('pol roditelja se ne slaže → greška', () => {
    const data = proposal(tree, { persons: [proposed('n1', 'Ana', { father_id: 2 })] });
    const check = checkProposal(tree, data);
    expect(codes(check)).toEqual(['error:parent_gender']);
    expect(check.can_approve).toBe(false);
  });

  it('nepoznata privremena referenca i osoba koja je sama sebi roditelj', () => {
    const data = proposal(tree, {
      persons: [proposed('n1', 'Ana', { father_id: 'nema' }), proposed('n2', 'Iva', { mother_id: 'n2' })],
    });
    expect(codes(checkProposal(tree, data))).toEqual(['error:unknown_ref', 'error:self_parent']);
  });

  it('predloženi roditelj za postojeću osobu koja već ima roditelja → zauzeto mesto', () => {
    const data = proposal(tree, {
      persons: [proposed('n1', 'Novi', { gender: 'M' })],
      parent_links: [{ child_id: 3, parent_id: 'n1', role: 'father' }],
    });
    expect(codes(checkProposal(tree, data))).toEqual(['error:parent_slot_taken']);
  });

  it('predloženi roditelj koji pravi krug u stablu → greška', () => {
    // Petar (1) dobija oca „Novog", a Novi je dete Jovana (3), koji je Petrov sin.
    const data = proposal(tree, {
      persons: [proposed('n1', 'Novi', { gender: 'M', father_id: 3 })],
      parent_links: [{ child_id: 1, parent_id: 'n1', role: 'father' }],
    });
    expect(codes(checkProposal(tree, data))).toContain('error:cycle');
  });

  it('prazno mesto roditelja može da se popuni', () => {
    const data = proposal(tree, {
      persons: [proposed('n1', 'Stana', { gender: 'F' })],
      parent_links: [{ child_id: 3, parent_id: 'n1', role: 'mother' }],
    });
    expect(checkProposal(tree, data).can_approve).toBe(true);
  });

  it('ID koji sada pokazuje na drugu osobu (restore/uvoz) → stale_ref; obrisana osoba → missing_person', () => {
    const data = proposal(tree, {
      persons: [proposed('n1', 'Ana', { father_id: 3, mother_id: 2 })],
    });
    const changed: TreeResponse = {
      persons: [person(1, 'Petar', { gender: 'M' }), person(3, 'Zoran', { gender: 'M', last_name: 'Ilić' })],
      unions: [],
    };
    expect(codes(checkProposal(changed, data))).toEqual(['error:missing_person', 'error:stale_ref']);
  });

  it('ispravka dijakritika nije promena osobe', () => {
    const data = proposal(tree, { persons: [proposed('n1', 'Ana', { father_id: 3 })] });
    const renamed: TreeResponse = {
      ...tree,
      persons: tree.persons.map((p) => (p.id === 3 ? { ...p, last_name: 'Petrovic' } : p)),
    };
    expect(checkProposal(renamed, data).can_approve).toBe(true);
  });

  it('mogući duplikat je upozorenje; spajanje sa postojećom osobom ga uklanja', () => {
    const data = proposal(tree, {
      persons: [
        proposed('n1', 'Jovan', { gender: 'M', birth_date: '1971' }),
        proposed('n2', 'Luka', { gender: 'M', father_id: 'n1' }),
      ],
    });
    const check = checkProposal(tree, data);
    expect(codes(check)).toEqual(['warning:possible_duplicate']);
    expect(check.issues[0]).toMatchObject({ temp_id: 'n1', candidate_ids: [3] });
    expect(check.can_approve).toBe(true);

    expect(checkProposal(tree, data, { merges: [{ temp_id: 'n1', person_id: 3 }] }).issues).toEqual([]);
    expect(codes(checkProposal(tree, data, { merges: [{ temp_id: 'n1', person_id: 99 }] }))).toContain(
      'error:invalid_merge',
    );
  });

  it('brak koji već postoji je upozorenje, brak sa samim sobom greška', () => {
    const data = proposal(tree, {
      persons: [proposed('n1', 'Ana', { father_id: 1 })],
      unions: [
        { partner1_id: 2, partner2_id: 1, type: 'marriage', start_date: null, end_date: null, end_reason: null, notes: null },
        { partner1_id: 'n1', partner2_id: 'nema', type: 'marriage', start_date: null, end_date: null, end_reason: null, notes: null },
      ],
    });
    expect(codes(checkProposal(tree, data))).toEqual(['error:invalid_union', 'warning:union_exists']);
  });
});

describe('findPossibleDuplicates', () => {
  const persons = [
    person(1, 'Đorđe', { gender: 'M', birth_date: '1950-02-01' }),
    person(2, 'Milica', { gender: 'F', last_name: 'Jovanović', maiden_name: 'Petrović', birth_date: '1980' }),
    person(3, 'Đorđe', { gender: 'M', birth_date: '1990' }),
  ];

  it('poklapa ime bez dijakritika i godinu rođenja ±2', () => {
    const found = findPossibleDuplicates(persons, { first_name: 'Djordje', last_name: 'Petrovic', maiden_name: null, gender: 'U', birth_date: '1952' });
    expect(found.map((p) => p.id)).toEqual([1]);
  });

  it('poklapa devojačko prezime i ne meša polove', () => {
    const base = { first_name: 'Milica', last_name: 'Petrović', maiden_name: null, birth_date: null };
    expect(findPossibleDuplicates(persons, { ...base, gender: 'F' }).map((p) => p.id)).toEqual([2]);
    expect(findPossibleDuplicates(persons, { ...base, gender: 'M' })).toEqual([]);
  });
});
