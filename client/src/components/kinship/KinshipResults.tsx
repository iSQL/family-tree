import { Waypoints } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import type { KinshipResult } from '@shared/kinship';
import { hasConnectionView } from '@shared/kinship/connection';
import { KinshipResultView } from './KinshipResultView';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

export interface KinshipResultsProps {
  /** Jedna ili više nezavisnih linija srodstva (describeKinships). */
  results: KinshipResult[];
  tree: TreeResponse;
  onPathClick: (id: number) => void;
  /** Klik na „Prikaži vezu" za datu liniju (indeks). Bez ovoga se dugme ne prikazuje. */
  onShowConnection?: (lineIndex: number) => void;
}

/**
 * Prikaz rezultata srodstva sa podrškom za VIŠE linija (dvostruko/višestruko srodstvo).
 * Svaka linija ima svoj „Prikaži vezu" — korisnik bira koju vezu da vizuelizuje u stablu.
 * Kad je linija samo jedna, izgleda kao i pre (bez zaglavlja linije).
 */
export function KinshipResults({ results, tree, onPathClick, onShowConnection }: KinshipResultsProps) {
  const multi = results.length > 1;

  return (
    <div className="space-y-4">
      {multi && (
        <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">
          {STR.kinship.multiNote}
        </p>
      )}

      {results.map((result, i) => {
        const showBtn = onShowConnection !== undefined && hasConnectionView(result);
        return (
          <div
            key={i}
            className={multi ? 'rounded-xl border border-stone-200 p-4 dark:border-stone-700' : ''}
          >
            {multi && (
              <div className="mb-2.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span className="rounded-full bg-stone-200 px-2 py-0.5 text-xs font-semibold text-stone-700 dark:bg-stone-700 dark:text-stone-200">
                  {i + 1}. {STR.kinship.lineWord}
                </span>
                {result.viaLabel && (
                  <span className="text-xs text-stone-500 dark:text-stone-400">
                    {STR.kinship.via} {result.viaLabel}
                  </span>
                )}
              </div>
            )}

            <KinshipResultView result={result} tree={tree} onPathClick={onPathClick} />

            {showBtn && (
              <div className="mt-3">
                <Button size="sm" variant="secondary" onClick={() => onShowConnection(i)}>
                  <Waypoints size={14} aria-hidden="true" />
                  {STR.kinship.showConnection}
                </Button>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
