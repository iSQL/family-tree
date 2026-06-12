import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, ArrowRight } from 'lucide-react';
import type { PersonSlim, TreeResponse } from '@shared/types';
import { describeKinship, type KinshipResult } from '@shared/kinship';
import { useTree } from '../hooks/useTree';
import { Avatar } from '../components/person/Avatar';
import { RelativePicker } from '../components/person/RelativePicker';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Field } from '../components/ui/Input';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

function safeKinship(tree: TreeResponse, fromId: number, toId: number): KinshipResult | 'error' {
  try {
    return describeKinship(tree, fromId, toId);
  } catch {
    return 'error';
  }
}

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

export default function CalculatorPage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const navigate = useNavigate();
  const [aId, setAId] = useState<number | null>(null);
  const [bId, setBId] = useState<number | null>(null);

  const result = useMemo(() => {
    if (!tree || aId === null || bId === null || aId === bId) return null;
    return safeKinship(tree, aId, bId);
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

  const byId = new Map(tree.persons.map((p) => [p.id, p]));
  const pathPersons =
    result !== null && result !== 'error'
      ? result.path.map((id) => byId.get(id)).filter((p): p is PersonSlim => p !== undefined)
      : [];

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
        ) : result === null ? (
          <p className="px-1 text-sm text-stone-500 dark:text-stone-400">{STR.kinship.pickBoth}</p>
        ) : result === 'error' ? (
          <p className="px-1 text-sm text-red-600 dark:text-red-400">{STR.kinship.error}</p>
        ) : (
          <Card className="space-y-4 p-5">
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
                      {i > 0 && (
                        <ArrowRight size={14} aria-hidden="true" className="shrink-0 text-stone-400" />
                      )}
                      <PathChip person={p} onClick={() => navigate(`/?focus=${p.id}`)} />
                    </span>
                  ))}
                </div>
              </div>
            )}
          </Card>
        )}
      </div>
    </div>
  );
}
