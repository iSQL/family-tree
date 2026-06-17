import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Plus, TreeDeciduous } from 'lucide-react';
import { resolveTreeDepth, DEFAULT_ANCESTRY_DEPTH, DEFAULT_PROGENY_DEPTH } from '@shared/treeView';
import { useTree } from '../hooks/useTree';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useReadonly, useCanWrite } from '../hooks/useAccess';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { TreeControls } from '../components/tree/TreeControls';
import { KinshipPanel } from '../components/tree/KinshipPanel';
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
  // Mod „Srodstvo": izbor do dve osobe u stablu za prikaz njihovog srodstva.
  const [kinshipMode, setKinshipMode] = useState(false);
  const [kinshipSel, setKinshipSel] = useState<number[]>([]);

  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  // Dubina prikaza (broj generacija oko glavne osobe). ?up=/?down= u URL-u; bez njih
  // se primenjuje adaptivni podrazumevani (malo stablo = sve, veliko = ograničeno).
  const upParam = searchParams.get('up');
  const downParam = searchParams.get('down');
  const { ancestry, progeny } = resolveTreeDepth(
    tree?.persons.length ?? 0,
    upParam === null ? null : Number(upParam),
    downParam === null ? null : Number(downParam),
  );

  // Spoji izmenu u postojeće URL parametre (null briše ključ) — čuva fokus i dubinu zajedno.
  const mergeParams = useCallback(
    (patch: Record<string, string | null>) => {
      const next = new URLSearchParams(searchParams);
      for (const [k, v] of Object.entries(patch)) {
        if (v === null) next.delete(k);
        else next.set(k, v);
      }
      setSearchParams(next, { replace: true });
    },
    [searchParams, setSearchParams],
  );

  // Re-root stabla na osobu (dupli klik, „Prikaži stablo odavde", klik na srodnika).
  const focusPerson = useCallback(
    (id: number) => {
      if (focusId !== null && focusId !== id) setFocusHistory((h) => [...h, focusId]);
      mergeParams({ focus: String(id) });
    },
    [focusId, mergeParams],
  );

  // Promena dubine za jednu osu (preci/potomci). undefined = „sve" (neograničeno):
  // „+" sa „sve" je onemogućen u kontrolama; „−" sa „sve" počinje ograničavanje od podrazumevanog.
  const changeDepth = useCallback(
    (axis: 'ancestry' | 'progeny', delta: number) => {
      const cur = axis === 'ancestry' ? ancestry : progeny;
      const fallback = axis === 'ancestry' ? DEFAULT_ANCESTRY_DEPTH : DEFAULT_PROGENY_DEPTH;
      const next =
        delta > 0
          ? cur === undefined
            ? undefined
            : cur + 1
          : cur === undefined
            ? fallback
            : Math.max(0, cur - 1);
      const up = axis === 'ancestry' ? next : ancestry;
      const down = axis === 'progeny' ? next : progeny;
      mergeParams({
        up: up === undefined ? null : String(up),
        down: down === undefined ? null : String(down),
      });
    },
    [ancestry, progeny, mergeParams],
  );

  // Izbor osobe u modu „Srodstvo": dodaj/ukloni; pri 3. izboru izgura najstariju.
  const toggleKinshipSelect = useCallback((id: number) => {
    setKinshipSel((sel) => {
      if (sel.includes(id)) return sel.filter((x) => x !== id);
      if (sel.length < 2) return [...sel, id];
      return [sel[1]!, id];
    });
  }, []);

  // Jednostruki klik na čvor — u modu „Srodstvo" bira osobu, inače otvara detalje.
  const handlePersonClick = useCallback(
    (id: number) => {
      if (kinshipMode) toggleKinshipSelect(id);
      else setSelectedId(id);
    },
    [kinshipMode, toggleKinshipSelect],
  );

  // Uđi/izađi iz moda „Srodstvo" — pri ulasku zatvori detalje, pri izlasku očisti izbor.
  const toggleKinshipMode = useCallback(() => {
    setKinshipMode((on) => {
      if (on) {
        setKinshipSel([]);
        return false;
      }
      setSelectedId(null);
      return true;
    });
  }, []);

  // Klik na srodnika u panelu — re-root + zadrži panel na njemu.
  const handleRelativeClick = useCallback(
    (id: number) => {
      focusPerson(id);
      setSelectedId(id);
    },
    [focusPerson],
  );

  // „Prethodni pregled" — vrati fokus na prethodno fokusiranu osobu (ili ukloni fokus);
  // dubina se zadržava.
  const goBack = useCallback(() => {
    if (focusHistory.length === 0) {
      mergeParams({ focus: null });
      return;
    }
    const prev = focusHistory[focusHistory.length - 1]!;
    setFocusHistory((h) => h.slice(0, -1));
    mergeParams({ focus: String(prev) });
  }, [focusHistory, mergeParams]);

  // „Cela porodica" — ukloni fokus I dubinu, prikaži celo neograničeno stablo.
  const resetFocus = useCallback(() => {
    setFocusHistory([]);
    mergeParams({ focus: null, up: null, down: null });
  }, [mergeParams]);

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

      // Escape zatvara mod „Srodstvo".
      if (e.key === 'Escape' && kinshipMode) {
        e.preventDefault();
        toggleKinshipMode();
        return;
      }

      const key = e.key.toLowerCase();
      if (key !== 'z' && key !== 'x') return;
      if (kinshipMode) return;

      const anchorId = selectedId ?? focusId;
      if (anchorId === null || !canWrite) return;

      e.preventDefault();
      const relation = key === 'z' ? 'childOf' : 'spouseOf';
      navigate(`/person/new?${relation}=${anchorId}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, focusId, canWrite, navigate, kinshipMode, toggleKinshipMode]);

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
        selectedIds={kinshipMode ? kinshipSel : undefined}
        ancestryDepth={ancestry}
        progenyDepth={progeny}
      />

      <TreeControls
        canGoBack={focusHistory.length > 0}
        isBounded={focusId !== null || ancestry !== undefined || progeny !== undefined}
        ancestry={ancestry}
        progeny={progeny}
        onBack={goBack}
        onReset={resetFocus}
        onChangeDepth={changeDepth}
      />

      {/* Prekidač moda „Srodstvo" (gore-desno) */}
      <Button
        variant={kinshipMode ? 'primary' : 'secondary'}
        size="sm"
        className="absolute top-3 right-3 z-20 shadow-lg"
        onClick={toggleKinshipMode}
        aria-pressed={kinshipMode}
      >
        <HeartHandshake size={16} aria-hidden="true" />
        <span className="hidden sm:inline">
          {kinshipMode ? STR.tree.kinshipModeOn : STR.tree.kinshipMode}
        </span>
      </Button>

      {kinshipMode && (
        <KinshipPanel
          tree={tree}
          selectedIds={kinshipSel}
          onRemove={toggleKinshipSelect}
          onSwap={() => setKinshipSel((sel) => (sel.length === 2 ? [sel[1]!, sel[0]!] : sel))}
          onClear={() => setKinshipSel([])}
          onExit={toggleKinshipMode}
        />
      )}

      {/* Plutajuće dugme za dodavanje — sakriveno dok je sheet otvoren, u modu „Srodstvo" ili u režimu pregleda */}
      {!sheetOpen && !readonly && !kinshipMode && (
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
