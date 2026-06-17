import { ArrowRight } from 'lucide-react';
import type { PersonSlim, TreeResponse } from '@shared/types';
import type { KinshipResult } from '@shared/kinship';
import { Avatar } from '../person/Avatar';
import { STR } from '../../lib/strings';

function PathChip({ person, onClick }: { person: PersonSlim; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white py-1 pr-3 pl-1 text-sm hover:border-amber-600 hover:bg-amber-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
    >
      <Avatar person={person} size={24} />
      <span className="truncate">
        {person.first_name} {person.last_name}
      </span>
    </button>
  );
}

export interface KinshipResultViewProps {
  result: KinshipResult;
  tree: TreeResponse;
  /** Klik na osobu u putanji (npr. fokusiraj je u stablu). */
  onPathClick: (id: number) => void;
}

/** Prikaz rezultata srodstva — deljeno između kalkulatora i panela u stablu. */
export function KinshipResultView({ result, tree, onPathClick }: KinshipResultViewProps) {
  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const pathPersons = result.path
    .map((id) => byId.get(id))
    .filter((p): p is PersonSlim => p !== undefined);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        {result.term !== null && (
          <span className="rounded-full bg-amber-600 px-3 py-1 text-sm font-semibold text-white">
            {result.term}
          </span>
        )}
        {result.degree !== null && (
          <span className="rounded-full bg-stone-200 px-3 py-1 text-xs font-medium text-stone-700 dark:bg-stone-700 dark:text-stone-200">
            {result.degree}. {STR.kinship.degreeSuffix}
          </span>
        )}
      </div>
      <p className="text-lg font-medium">{result.description}</p>

      {pathPersons.length > 1 && (
        <div>
          <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
            {STR.kinship.pathLabel}
          </h3>
          <div className="flex flex-wrap items-center gap-1.5">
            {pathPersons.map((p, i) => (
              <span key={`${p.id}-${i}`} className="flex items-center gap-1.5">
                {i > 0 && <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-stone-400" />}
                <PathChip person={p} onClick={() => onPathClick(p.id)} />
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
