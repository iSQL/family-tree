import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Plus, TreeDeciduous } from 'lucide-react';
import { useTree } from '../hooks/useTree';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useReadonly, useCanWrite } from '../hooks/useAccess';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { TreeControls } from '../components/tree/TreeControls';
import { PersonDrawer } from '../components/person/PersonDrawer';
import { PersonSheet } from '../components/person/PersonSheet';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

export default function TreePage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const readonly = useReadonly();
  const canWrite = useCanWrite();
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusHistory, setFocusHistory] = useState<number[]>([]);

  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  // Re-root stabla na osobu (dupli klik, „Prikaži stablo odavde", klik na srodnika).
  const focusPerson = useCallback(
    (id: number) => {
      if (focusId !== null && focusId !== id) setFocusHistory((h) => [...h, focusId]);
      setSearchParams({ focus: String(id) }, { replace: true });
    },
    [focusId, setSearchParams],
  );

  // Jednostruki klik na čvor — otvori detalje (drawer/sheet).
  const handlePersonClick = useCallback((id: number) => setSelectedId(id), []);

  // Klik na srodnika u panelu — re-root + zadrži panel na njemu.
  const handleRelativeClick = useCallback(
    (id: number) => {
      focusPerson(id);
      setSelectedId(id);
    },
    [focusPerson],
  );

  // „Prethodni pregled" — vrati fokus na prethodno fokusiranu osobu (ili celu porodicu).
  const goBack = useCallback(() => {
    if (focusHistory.length === 0) {
      setSearchParams({}, { replace: true });
      return;
    }
    const prev = focusHistory[focusHistory.length - 1]!;
    setFocusHistory((h) => h.slice(0, -1));
    setSearchParams({ focus: String(prev) }, { replace: true });
  }, [focusHistory, setSearchParams]);

  // „Cela porodica" — ukloni fokus, prikaži celo stablo.
  const resetFocus = useCallback(() => {
    setFocusHistory([]);
    setSearchParams({}, { replace: true });
  }, [setSearchParams]);

  // Prečice sa tastature: „z" dodaj dete, „x" dodaj supružnika — za trenutno
  // izabranu (ili fokusiranu) osobu. Ignoriše unos u poljima, offline i režim pregleda.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.repeat) return;
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName))
      )
        return;

      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'x') return;

      const anchorId = selectedId ?? focusId;
      if (anchorId === null || !canWrite) return;

      e.preventDefault();
      const relation = key === 'z' ? 'childOf' : 'spouseOf';
      navigate(`/person/new?${relation}=${anchorId}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, focusId, canWrite, navigate]);

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
        {!readonly && (
          <Button onClick={() => navigate('/person/new')}>
            <Plus size={16} aria-hidden="true" />
            {STR.tree.addFirstPerson}
          </Button>
        )}
      </div>
    );
  }

  const sheetOpen = !isDesktop && selectedId !== null;

  return (
    <div className="relative min-h-0 flex-1 overflow-hidden">
      <TreeCanvas
        tree={tree}
        focusId={focusId}
        onPersonClick={handlePersonClick}
        onPersonActivate={focusPerson}
      />

      <TreeControls
        canGoBack={focusHistory.length > 0}
        hasFocus={focusId !== null}
        onBack={goBack}
        onReset={resetFocus}
      />

      {/* Plutajuće dugme za dodavanje — sakriveno dok je sheet otvoren ili u režimu pregleda */}
      {!sheetOpen && !readonly && (
        <Button
          onClick={() => navigate('/person/new')}
          className="absolute bottom-4 left-4 z-10 rounded-full shadow-lg sm:rounded-lg"
          aria-label={STR.tree.addPerson}
        >
          <Plus size={16} aria-hidden="true" />
          <span className="hidden sm:inline">{STR.tree.addPerson}</span>
        </Button>
      )}

      {isDesktop && selectedId !== null && (
        <PersonDrawer
          personId={selectedId}
          onClose={() => setSelectedId(null)}
          onFocusPerson={handleRelativeClick}
          onShowInTree={focusPerson}
        />
      )}
      {sheetOpen && selectedId !== null && (
        <PersonSheet
          personId={selectedId}
          onClose={() => setSelectedId(null)}
          onFocusPerson={handleRelativeClick}
          onShowInTree={(id) => {
            focusPerson(id);
            setSelectedId(null);
          }}
        />
      )}
    </div>
  );
}
