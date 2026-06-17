import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { PersonSlim, TreeResponse } from '@shared/types';
import type { KinshipResult } from '@shared/kinship';
import { Avatar } from '../person/Avatar';
import { STR } from '../../lib/strings';

function PathChip({
  person,
  onClick,
  isApex,
}: {
  person: PersonSlim;
  onClick: () => void;
  isApex: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={isApex ? STR.kinship.commonAncestor : undefined}
      className={`flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-amber-50 dark:hover:bg-stone-700 ${
        isApex
          ? 'border-amber-500 bg-amber-50 ring-1 ring-amber-500 dark:bg-stone-700'
          : 'border-stone-300 bg-white hover:border-amber-600 dark:border-stone-600 dark:bg-stone-800'
      }`}
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
  // Prevoj = zajednički predak; do njega strelice naviše (↗), od njega naniže (↘).
  const apex = result.apexIndex;
  // „Zajednički predak" ističemo samo kad je stvarni prevoj (V-putanja), a ne kad je
  // sama osoba A ili B predak (čisto uzlazna/silazna veza).
  const interiorApex = apex !== null && apex > 0 && apex < pathPersons.length - 1;

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
            {pathPersons.map((p, i) => {
              // Ivica i-1 → i: uzlazna dok ne pređemo prevoj, potom silazna.
              const ascending = apex === null || i <= apex;
              return (
                <span key={`${p.id}-${i}`} className="flex items-center gap-1.5">
                  {i > 0 &&
                    (ascending ? (
                      <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-teal-600" />
                    ) : (
                      <ArrowDownRight size={15} aria-hidden="true" className="shrink-0 text-rose-500" />
                    ))}
                  <PathChip person={p} onClick={() => onPathClick(p.id)} isApex={interiorApex && i === apex} />
                </span>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
