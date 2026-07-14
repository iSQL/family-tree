import { useMemo } from 'react';
import { Crown, Users } from 'lucide-react';
import type { PersonSlim, TreeResponse } from '@shared/types';
import { chooserFamilies } from '@shared/families';
import { Avatar } from '../person/Avatar';
import { formatLifespan } from '../../lib/dates';
import { STR } from '../../lib/strings';

export interface FamilyChooserProps {
  tree: TreeResponse;
  /** Klik na porodicu — re-root stabla na njenog najstarijeg osnivača. */
  onPick: (id: number) => void;
}

/** Naziv porodice po prezimenu predstavnika; rezerva ako je prazno. */
function familyName(rep: PersonSlim): string {
  return rep.last_name.trim() || rep.first_name.trim() || '?';
}

/** Red osnivača: „Marko & Ana" (predstavnik + su-osnivač), inače samo predstavnik. */
function foundersLine(rep: PersonSlim, co: PersonSlim | null): string {
  return co ? `${rep.first_name} & ${co.first_name}` : rep.first_name;
}

/** Landing ekran: izbor porodice (povezane celine) za prikaz u stablu. */
export function FamilyChooser({ tree, onPick }: FamilyChooserProps) {
  const families = useMemo(() => chooserFamilies(tree), [tree]);
  const byId = useMemo(() => {
    const m = new Map<number, PersonSlim>();
    for (const p of tree.persons) m.set(p.id, p);
    return m;
  }, [tree]);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl space-y-4 p-4">
        <div className="px-1">
          <div className="flex items-center gap-2.5">
            <Users size={20} className="text-gold" aria-hidden="true" />
            <h1 className="font-display text-2xl font-normal text-heading">{STR.tree.chooseFamily}</h1>
            <span className="text-sm text-faint">({families.length})</span>
          </div>
          <div className="zb-label mt-0.5 text-[11px] tracking-[.24em] text-goldd">
            {STR.brand.municipality}
          </div>
        </div>

        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {families.map((fam) => {
            const rep = byId.get(fam.representativeId);
            if (!rep) return null;
            const co = fam.coFounderId !== null ? (byId.get(fam.coFounderId) ?? null) : null;
            const years = formatLifespan(rep.birth_date, rep.death_date);
            return (
              <li key={fam.representativeId}>
                <button
                  type="button"
                  onClick={() => onPick(fam.representativeId)}
                  className="flex w-full cursor-pointer items-center gap-3.5 rounded-2xl border border-line bg-cardbg p-4 text-left shadow-[0_6px_18px_-12px_rgba(20,30,50,.4)] transition-[border-color,transform] hover:-translate-y-0.5 hover:border-gold"
                >
                  <Avatar person={rep} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-display text-lg text-heading">{familyName(rep)}</span>
                      {fam.designated && (
                        <span className="zb-label inline-flex shrink-0 items-center gap-1 rounded-full bg-activebg px-2 py-0.5 text-[10px] tracking-[.06em] text-activefg">
                          <Crown size={10} aria-hidden="true" />
                          {STR.tree.designatedBadge}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-base text-muted">
                      {foundersLine(rep, co)}
                      {years && ` · ${years}`}
                    </div>
                    <div className="zb-label mt-1 text-[11px] tracking-[.06em] text-faint">
                      {fam.size} {STR.tree.members}
                    </div>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
