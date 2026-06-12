import { useCallback, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, TreeDeciduous } from 'lucide-react';
import { useTree } from '../hooks/useTree';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { PersonDrawer } from '../components/person/PersonDrawer';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

export default function TreePage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  const handlePersonClick = useCallback(
    (id: number) => {
      if (isDesktop) setSelectedId(id);
      else navigate(`/person/${id}`);
    },
    [isDesktop, navigate],
  );

  const handleFocusPerson = useCallback(
    (id: number) => {
      setSelectedId(id);
      setSearchParams({ focus: String(id) }, { replace: true });
    },
    [setSearchParams],
  );

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.tree.loadFailed}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  if (tree.persons.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <TreeDeciduous size={56} className="text-stone-300 dark:text-stone-600" aria-hidden="true" />
        <div>
          <h2 className="text-lg font-semibold">{STR.tree.emptyTitle}</h2>
          <p className="mt-1 text-sm text-stone-500 dark:text-stone-400">{STR.tree.emptyText}</p>
        </div>
        <Button onClick={() => navigate('/person/new')}>
          <Plus size={16} aria-hidden="true" />
          {STR.tree.addFirstPerson}
        </Button>
      </div>
    );
  }

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <TreeCanvas tree={tree} focusId={focusId} onPersonClick={handlePersonClick} />

      {/* Plutajuće dugme za dodavanje */}
      <Button
        onClick={() => navigate('/person/new')}
        className="absolute bottom-4 left-4 z-10 shadow-lg"
        aria-label={STR.tree.addPerson}
      >
        <Plus size={16} aria-hidden="true" />
        {STR.tree.addPerson}
      </Button>

      {isDesktop && selectedId !== null && (
        <PersonDrawer
          personId={selectedId}
          onClose={() => setSelectedId(null)}
          onFocusPerson={handleFocusPerson}
        />
      )}
    </div>
  );
}
