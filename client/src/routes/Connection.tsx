import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import { describeKinship, type KinshipResult } from '@shared/kinship';
import { buildConnectionView } from '@shared/kinship/connection';
import { useTree } from '../hooks/useTree';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

function safeKinship(tree: TreeResponse, fromId: number, toId: number): KinshipResult | 'error' {
  try {
    return describeKinship(tree, fromId, toId);
  } catch {
    return 'error';
  }
}

function parseIdParam(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Fokusirani prikaz veze između dve osobe: samo osobe duž putanje srodstva, u f3 stablu. */
export default function ConnectionPage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const aId = parseIdParam(searchParams.get('a'));
  const bId = parseIdParam(searchParams.get('b'));

  const result = useMemo(() => {
    if (!tree || aId === null || bId === null || aId === bId) return null;
    return safeKinship(tree, aId, bId);
  }, [tree, aId, bId]);

  const view = useMemo(() => {
    if (!tree || result === null || result === 'error') return null;
    return buildConnectionView(tree, result);
  }, [tree, result]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.common.error}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  const backHref =
    aId !== null && bId !== null ? `/calculator?a=${aId}&b=${bId}` : '/calculator';

  // Bez validnog prikaza → poruka + povratak na kalkulator.
  if (view === null || result === null || result === 'error') {
    const message =
      aId === null || bId === null
        ? STR.kinship.connectionMissing
        : aId === bId
          ? STR.kinship.samePerson
          : result === 'error'
            ? STR.kinship.error
            : STR.kinship.connectionUnavailable;
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{message}</p>
        <Button onClick={() => navigate(backHref)}>{STR.kinship.backToCalculator}</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Zaglavlje: povratak + termin + rečenica */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-stone-200 bg-white px-3 py-2 dark:border-stone-700 dark:bg-stone-800">
        <Link
          to={backHref}
          className="flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm text-stone-600 hover:bg-stone-200/70 hover:text-stone-900 dark:text-stone-300 dark:hover:bg-stone-700 dark:hover:text-stone-100"
        >
          <ArrowLeft size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{STR.kinship.backToCalculator}</span>
        </Link>
        {result.term !== null && (
          <span className="rounded-full bg-amber-600 px-3 py-1 text-sm font-semibold text-white">
            {result.term}
          </span>
        )}
        <p className="min-w-0 flex-1 truncate text-sm font-medium" title={result.description}>
          {result.description}
        </p>
      </div>

      <div className="relative min-h-0 flex-1 overflow-hidden">
        <TreeCanvas
          tree={view.tree}
          focusId={view.mainId}
          onPersonClick={(id) => navigate(`/person/${id}`)}
          onPersonActivate={(id) => navigate(`/?focus=${id}`)}
          selectedIds={aId !== null && bId !== null ? [aId, bId] : undefined}
        />
      </div>
    </div>
  );
}
