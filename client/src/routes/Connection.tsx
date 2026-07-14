import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Printer } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import { describeKinships, type KinshipResult } from '@shared/kinship';
import { buildConnectionView } from '@shared/kinship/connection';
import { useTree } from '../hooks/useTree';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

function safeKinships(tree: TreeResponse, fromId: number, toId: number): KinshipResult[] | 'error' {
  try {
    return describeKinships(tree, fromId, toId);
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
  const lineParam = Number(searchParams.get('line'));

  const results = useMemo(() => {
    if (!tree || aId === null || bId === null || aId === bId) return null;
    return safeKinships(tree, aId, bId);
  }, [tree, aId, bId]);

  // Izabrana linija (dvostruko srodstvo) — indeks iz URL-a, ograničen na opseg.
  const lines = results !== null && results !== 'error' ? results : [];
  const lineIndex = Number.isInteger(lineParam) && lineParam >= 0 && lineParam < lines.length ? lineParam : 0;
  const result = results === null || results === 'error' ? results : (lines[lineIndex] ?? null);

  const view = useMemo(() => {
    if (!tree || result === null || result === 'error') return null;
    return buildConnectionView(tree, result);
  }, [tree, result]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base text-muted">{STR.common.error}</p>
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
        <p className="text-base text-muted">{message}</p>
        <Button onClick={() => navigate(backHref)}>{STR.kinship.backToCalculator}</Button>
      </div>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Zaglavlje: povratak + termin + rečenica */}
      <div className="flex flex-col gap-1.5 border-b border-line bg-surface px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <Link
            to={backHref}
            className="zb-label flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-ink"
          >
            <ArrowLeft size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{STR.kinship.backToCalculator}</span>
          </Link>
          {result.term !== null && (
            <span className="font-display rounded-full bg-navy px-3 py-0.5 text-base text-onnav dark:bg-activebg dark:text-activefg">
              {result.term}
            </span>
          )}
          <p className="min-w-0 flex-1 truncate text-base text-ink" title={result.description}>
            {result.description}
          </p>
          <Link
            to={`/settings/poster?scope=kinship&a=${aId}&b=${bId}&line=${lineIndex}`}
            className="zb-label flex items-center gap-1.5 rounded-md px-2 py-1.5 text-xs text-muted hover:bg-surface2 hover:text-ink"
            title={STR.poster.title}
          >
            <Printer size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{STR.poster.posterButton}</span>
          </Link>
        </div>

        {/* Prebacivanje linija (dvostruko/višestruko srodstvo) */}
        {lines.length > 1 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-faint">{STR.kinship.multiNote}</span>
            {lines.map((ln, i) => (
              <Link
                key={i}
                to={`/connection?a=${aId}&b=${bId}&line=${i}`}
                className={`rounded-full border px-2.5 py-0.5 text-xs ${
                  i === lineIndex
                    ? 'border-gold bg-activebg text-activefg'
                    : 'border-line text-muted hover:bg-surface2'
                }`}
                title={ln.viaLabel ? `${STR.kinship.via} ${ln.viaLabel}` : undefined}
              >
                {i + 1}. {ln.term ?? STR.kinship.lineWord}
              </Link>
            ))}
          </div>
        )}
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
