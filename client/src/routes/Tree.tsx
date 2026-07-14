import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Plus, Printer, TreeDeciduous } from 'lucide-react';
import { resolveProgenyDepth, maxDescendantDepth } from '@shared/treeView';
import { useTree } from '../hooks/useTree';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useReadonly, useCanWrite } from '../hooks/useAccess';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { TreeControls } from '../components/tree/TreeControls';
import { FamilyChooser } from '../components/family/FamilyChooser';
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

  // Dubina prikaza POTOMAKA (?down= u URL-u). Preci se uvek prikazuju u celosti.
  // Bez parametra: malo stablo = svi potomci, veliko = adaptivni podrazumevani.
  // Glavna osoba = fokus, ili podrazumevani koren (f3 uzima prvu osobu = najmanji id).
  const mainId = focusId ?? tree?.persons[0]?.id ?? null;
  const maxProgeny = useMemo(
    () => (tree && mainId !== null ? maxDescendantDepth(tree.persons, mainId) : 0),
    [tree, mainId],
  );
  const downParam = searchParams.get('down');
  const progeny = resolveProgenyDepth(
    tree?.persons.length ?? 0,
    downParam === null ? null : Number(downParam),
    maxProgeny,
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

  // Promena broja generacija potomaka — ograničeno na [0, maxProgeny] (koliko ih čvor ima).
  const changeProgeny = useCallback(
    (delta: number) => {
      const next = Math.max(0, Math.min(maxProgeny, progeny + delta));
      mergeParams({ down: String(next) });
    },
    [progeny, maxProgeny, mergeParams],
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

  // „Cela porodica" — ukloni fokus I ograničenje potomaka.
  const resetFocus = useCallback(() => {
    setFocusHistory([]);
    mergeParams({ focus: null, down: null });
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
        <p className="text-base text-muted">{STR.tree.loadFailed}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  if (tree.persons.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <TreeDeciduous size={56} className="text-faint" aria-hidden="true" />
        <div>
          <h2 className="font-display text-xl font-normal text-heading">{STR.tree.emptyTitle}</h2>
          <p className="mt-1 text-base text-muted">{STR.tree.emptyText}</p>
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

  // Bez fokusa → landing: izbor porodice. Stablo se prikazuje tek kad je osoba izabrana.
  if (focusId === null) {
    return <FamilyChooser tree={tree} onPick={focusPerson} />;
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
        progenyDepth={progeny}
      />

      <TreeControls
        canGoBack={focusHistory.length > 0}
        hasFocus={focusId !== null}
        progeny={progeny}
        maxProgeny={maxProgeny}
        onBack={goBack}
        onReset={resetFocus}
        onChangeProgeny={changeProgeny}
      />

      {/* Gore-desno: izvoz postera (trenutni prikaz) + prekidač moda „Srodstvo" */}
      <div className="absolute top-3 right-3 z-20 flex gap-2">
        {!kinshipMode && (
          <Button
            variant="secondary"
            size="sm"
            className="shadow-lg"
            onClick={() => navigate(`/settings/poster?scope=view&focus=${focusId}&down=${progeny}`)}
            title={STR.poster.title}
          >
            <Printer size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{STR.poster.posterButton}</span>
          </Button>
        )}
        <Button
          variant={kinshipMode ? 'primary' : 'secondary'}
          size="sm"
          className="shadow-lg"
          onClick={toggleKinshipMode}
          aria-pressed={kinshipMode}
        >
          <HeartHandshake size={16} aria-hidden="true" />
          <span className="hidden sm:inline">
            {kinshipMode ? STR.tree.kinshipModeOn : STR.tree.kinshipMode}
          </span>
        </Button>
      </div>

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
