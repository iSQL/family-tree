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
      className={`flex max-w-full cursor-pointer items-center gap-1.5 rounded-full border py-1 pr-3 pl-1 text-sm text-ink ${
        isApex
          ? 'border-gold bg-activebg ring-1 ring-gold'
          : 'border-line bg-cardbg hover:border-gold'
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
          <span className="font-display rounded-full bg-navy px-3.5 py-1 text-lg text-onnav dark:bg-activebg dark:text-activefg">
            {result.term}
          </span>
        )}
        {result.degree !== null && (
          <span className="zb-label rounded-full bg-activebg px-3 py-1 text-[11px] tracking-[.14em] text-activefg">
            {result.degree}. {STR.kinship.degreeSuffix}
          </span>
        )}
      </div>
      <p className="text-lg text-ink">{result.description}</p>

      {pathPersons.length > 1 && (
        <div>
          <h3 className="zb-label mb-1.5 text-[11px] tracking-[.16em] text-faint">
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
                      <ArrowUpRight size={15} aria-hidden="true" className="shrink-0 text-male" />
                    ) : (
                      <ArrowDownRight size={15} aria-hidden="true" className="shrink-0 text-goldd" />
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
