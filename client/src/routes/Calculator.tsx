import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import { describeKinships, type KinshipResult } from '@shared/kinship';
import { useTree } from '../hooks/useTree';
import { RelativePicker } from '../components/person/RelativePicker';
import { KinshipResults } from '../components/kinship/KinshipResults';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Input';
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

export default function CalculatorPage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [aId, setAId] = useState<number | null>(() => parseIdParam(searchParams.get('a')));
  const [bId, setBId] = useState<number | null>(() => parseIdParam(searchParams.get('b')));

  const results = useMemo(() => {
    if (!tree || aId === null || bId === null || aId === bId) return null;
    return safeKinships(tree, aId, bId);
  }, [tree, aId, bId]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.common.error}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <h1 className="text-lg font-bold">{STR.kinship.title}</h1>

        <Card className="p-4">
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-end">
            <Field label={STR.kinship.personA} className="flex-1">
              <RelativePicker
                persons={tree.persons}
                value={aId}
                onChange={setAId}
                excludeIds={bId !== null ? [bId] : []}
              />
            </Field>
            <Button
              variant="secondary"
              className="self-center sm:mb-0.5 sm:self-auto"
              aria-label={STR.kinship.swap}
              title={STR.kinship.swap}
              onClick={() => {
                setAId(bId);
                setBId(aId);
              }}
            >
              <ArrowLeftRight size={16} aria-hidden="true" />
            </Button>
            <Field label={STR.kinship.personB} className="flex-1">
              <RelativePicker
                persons={tree.persons}
                value={bId}
                onChange={setBId}
                excludeIds={aId !== null ? [aId] : []}
              />
            </Field>
          </div>
        </Card>

        {aId !== null && bId !== null && aId === bId ? (
          <p className="px-1 text-sm text-stone-500 dark:text-stone-400">{STR.kinship.samePerson}</p>
        ) : results === null ? (
          <p className="px-1 text-sm text-stone-500 dark:text-stone-400">{STR.kinship.pickBoth}</p>
        ) : results === 'error' ? (
          <p className="px-1 text-sm text-red-600 dark:text-red-400">{STR.kinship.error}</p>
        ) : (
          <Card className="p-5">
            <KinshipResults
              results={results}
              tree={tree}
              onPathClick={(id) => navigate(`/?focus=${id}`)}
              onShowConnection={(line) => navigate(`/connection?a=${aId}&b=${bId}&line=${line}`)}
            />
          </Card>
        )}
      </div>
    </div>
  );
}
