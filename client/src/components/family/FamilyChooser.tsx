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
        <div className="flex items-center gap-2 px-1">
          <Users size={20} className="text-amber-700 dark:text-amber-500" aria-hidden="true" />
          <h1 className="text-lg font-semibold">{STR.tree.chooseFamily}</h1>
          <span className="text-sm text-stone-400">({families.length})</span>
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
                  className="flex w-full cursor-pointer items-center gap-3 rounded-xl border border-stone-200 bg-white p-3 text-left shadow-sm transition-colors hover:border-amber-500 hover:bg-amber-50 dark:border-stone-700 dark:bg-stone-800 dark:hover:border-amber-500 dark:hover:bg-stone-700"
                >
                  <Avatar person={rep} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <span className="truncate font-semibold">{familyName(rep)}</span>
                      {fam.designated && (
                        <span className="inline-flex shrink-0 items-center gap-0.5 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950 dark:text-amber-300">
                          <Crown size={10} aria-hidden="true" />
                          {STR.tree.designatedBadge}
                        </span>
                      )}
                    </div>
                    <div className="truncate text-sm text-stone-600 dark:text-stone-300">
                      {foundersLine(rep, co)}
                      {years && ` · ${years}`}
                    </div>
                    <div className="mt-0.5 text-xs text-stone-400">
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
