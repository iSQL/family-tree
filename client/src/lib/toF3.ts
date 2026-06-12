/**
 * Konverzija TreeResponse → family-chart (f3) format.
 * Čista funkcija, bez uvoza 'family-chart' — TreeCanvas je jedini koji zna za f3.
 */
import type { Gender, TreeResponse } from '@shared/types';

export interface F3PersonData {
  gender: Gender;
  first_name: string;
  last_name: string;
  maiden_name: string | null;
  title: string | null;
  birth_date: string | null;
  death_date: string | null;
  photo_id: string | null;
}

export interface F3Datum {
  id: string;
  data: F3PersonData;
  rels: {
    father?: string;
    mother?: string;
    spouses: string[];
    children: string[];
  };
}

function addSpouse(d: F3Datum, spouseId: string): void {
  if (!d.rels.spouses.includes(spouseId)) d.rels.spouses.push(spouseId);
}

export function toF3(tree: TreeResponse): F3Datum[] {
  const byId = new Map<number, F3Datum>();

  for (const p of tree.persons) {
    byId.set(p.id, {
      id: String(p.id),
      data: {
        gender: p.gender,
        first_name: p.first_name,
        last_name: p.last_name,
        maiden_name: p.maiden_name,
        title: p.title,
        birth_date: p.birth_date,
        death_date: p.death_date,
        photo_id: p.photo_id,
      },
      rels: { spouses: [], children: [] },
    });
  }

  // Roditeljske veze + deca (preskoči viseće reference)
  for (const p of tree.persons) {
    const d = byId.get(p.id);
    if (!d) continue;
    if (p.father_id !== null) {
      const father = byId.get(p.father_id);
      if (father) {
        d.rels.father = father.id;
        father.rels.children.push(d.id);
      }
    }
    if (p.mother_id !== null) {
      const mother = byId.get(p.mother_id);
      if (mother) {
        d.rels.mother = mother.id;
        mother.rels.children.push(d.id);
      }
    }
  }

  // Supružnici iz unions
  for (const u of tree.unions) {
    const a = byId.get(u.partner1_id);
    const b = byId.get(u.partner2_id);
    if (!a || !b) continue;
    addSpouse(a, b.id);
    addSpouse(b, a.id);
  }

  // Implicitni supružnici: ko-roditelji deteta bez union-a — f3 layout
  // pozicionira dete između roditelja samo ako su međusobno "spouses".
  for (const p of tree.persons) {
    if (p.father_id === null || p.mother_id === null) continue;
    const f = byId.get(p.father_id);
    const m = byId.get(p.mother_id);
    if (!f || !m) continue;
    addSpouse(f, m.id);
    addSpouse(m, f.id);
  }

  // Deca sortirana po datumu rođenja (leksikografski = hronološki; bez datuma na kraj)
  const birthKey = new Map<string, string>();
  for (const p of tree.persons) {
    birthKey.set(String(p.id), p.birth_date ?? '￿');
  }
  for (const d of byId.values()) {
    d.rels.children.sort((a, b) => {
      const ka = birthKey.get(a) ?? '￿';
      const kb = birthKey.get(b) ?? '￿';
      return ka < kb ? -1 : ka > kb ? 1 : 0;
    });
  }

  return [...byId.values()];
}
