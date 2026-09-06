import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { HeartHandshake, Plus, Printer, TreeDeciduous } from 'lucide-react';
import { toast } from 'sonner';
import type { PersonSlim } from '@shared/types';
import {
  resolveProgenyDepth,
  maxDescendantDepth,
  hidePersonsFromTree,
  collectBranchIds,
  collectProtectedIds,
} from '@shared/treeView';
import { useTree } from '../hooks/useTree';
import { useIsDesktop } from '../hooks/useIsDesktop';
import { useReadonly, useCanWrite } from '../hooks/useAccess';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { TreeContextMenu } from '../components/tree/TreeContextMenu';
import { TreeControls } from '../components/tree/TreeControls';
import { FamilyChooser } from '../components/family/FamilyChooser';
import { KinshipPanel } from '../components/tree/KinshipPanel';
import { PersonDrawer } from '../components/person/PersonDrawer';
import { PersonSheet } from '../components/person/PersonSheet';
import { AddSpouseDialog } from '../components/person/AddSpouseDialog';
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
  // Kontekst meni nad karticom (desni klik / dugi pritisak).
  const [ctxMenu, setCtxMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  // Dijalog za dodavanje supružnika (izbor postojećeg ili novi).
  const [addSpouseTarget, setAddSpouseTarget] = useState<PersonSlim | null>(null);
  // Ručno skrivene grane (samo prikaz — podaci netaknuti). Grana = koren +
  // supružnici + potomci; vraća se pojedinačno (čip) ili sve odjednom.
  const [hiddenBranches, setHiddenBranches] = useState<
    { rootId: number; label: string; ids: number[] }[]
  >([]);

  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  // Dubina prikaza POTOMAKA (?down= u URL-u). Preci se uvek prikazuju u celosti.
  // Bez parametra: malo stablo = svi potomci, veliko = adaptivni podrazumevani.
  // Glavna osoba = fokus, ili podrazumevani koren (f3 uzima prvu osobu = najmanji id).
  const mainId = focusId ?? tree?.persons[0]?.id ?? null;

  const hiddenIds = useMemo(
    () => new Set(hiddenBranches.flatMap((b) => b.ids)),
    [hiddenBranches],
  );

  // Glavna osoba + preci — njihove kartice nemaju „−" i ne mogu da se sakriju.
  const protectedIds = useMemo(
    () => (tree && mainId !== null ? [...collectProtectedIds(tree, mainId)] : []),
    [tree, mainId],
  );

  // Stablo bez ručno skrivenih grana — SAMO za canvas i stepper potomaka;
  // pretraga, kalkulator srodstva i izbor porodice rade nad punim podacima.
  const visibleTree = useMemo(
    () => (tree ? hidePersonsFromTree(tree, hiddenIds) : undefined),
    [tree, hiddenIds],
  );
  const maxProgeny = useMemo(
    () => (visibleTree && mainId !== null ? maxDescendantDepth(visibleTree.persons, mainId) : 0),
    [visibleTree, mainId],
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
      // Fokusirana osoba mora biti vidljiva — vrati grane koje je skrivaju.
      setHiddenBranches((brs) => brs.filter((b) => !b.ids.includes(id)));
      mergeParams({ focus: String(id) });
    },
    [focusId, mergeParams],
  );

  // Sakrij granu (koren + supružnici + potomci); zaštićene osobe ne mogu.
  // Ako grana nosi otvorene detalje ili izbor za srodstvo, očisti i to.
  const hideBranch = useCallback(
    (id: number) => {
      if (!tree || mainId === null) return;
      const ids = collectBranchIds(tree, id, mainId);
      if (ids === null) return;
      const person = tree.persons.find((p) => p.id === id);
      const label = person ? `${person.first_name} ${person.last_name}`.trim() : '?';
      setHiddenBranches((brs) =>
        brs.some((b) => b.rootId === id) ? brs : [...brs, { rootId: id, label, ids }],
      );
      setSelectedId((sel) => (sel !== null && ids.includes(sel) ? null : sel));
      setKinshipSel((sel) => sel.filter((x) => !ids.includes(x)));
      toast(ids.length > 1 ? `Sakriveno: ${label} i grana (${ids.length})` : `Sakriveno: ${label}`);
    },
    [tree, mainId],
  );

  const restoreBranch = useCallback(
    (rootId: number) => {
      const branch = hiddenBranches.find((b) => b.rootId === rootId);
      setHiddenBranches((brs) => brs.filter((b) => b.rootId !== rootId));
      if (branch) toast(`Vraćeno u prikaz: ${branch.label}`);
    },
    [hiddenBranches],
  );

  const showAllBranches = useCallback(() => {
    setHiddenBranches([]);
    toast(STR.tree.allRestored);
  }, []);

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

  // Desni klik / dugi pritisak na čvor — otvori kontekst meni (van moda „Srodstvo").
  const handlePersonContextMenu = useCallback(
    (id: number, x: number, y: number) => {
      if (kinshipMode) return;
      setCtxMenu({ id, x, y });
    },
    [kinshipMode],
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
      if (key === 'x') {
        const anchor = tree?.persons.find((p) => p.id === anchorId);
        if (anchor) setAddSpouseTarget(anchor);
        return;
      }
      navigate(`/person/new?childOf=${anchorId}`);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [tree, selectedId, focusId, canWrite, navigate, kinshipMode, toggleKinshipMode]);

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
        tree={visibleTree ?? tree}
        focusId={focusId}
        onPersonClick={handlePersonClick}
        onPersonActivate={focusPerson}
        onPersonContextMenu={handlePersonContextMenu}
        onPersonHide={hideBranch}
        protectedIds={protectedIds}
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
        hiddenBranches={hiddenBranches.map((b) => ({
          rootId: b.rootId,
          label: b.label,
          count: b.ids.length,
        }))}
        onRestoreBranch={restoreBranch}
        onShowAll={showAllBranches}
      />

      {/* Gore-desno: izvoz postera (trenutni prikaz) + prekidač moda „Srodstvo" */}
      <div className="absolute top-3 right-3 z-20 flex gap-2">
        {!kinshipMode && (
          <Button
            variant="secondary"
            size="sm"
            className="shadow-lg"
            onClick={() => {
              // Prosledi i skrivene grane (koreni) — poster ih izostavlja kao i prikaz.
              const hide =
                hiddenBranches.length > 0
                  ? `&hide=${hiddenBranches.map((b) => b.rootId).join(',')}`
                  : '';
              navigate(`/settings/poster?scope=view&focus=${focusId}&down=${progeny}${hide}`);
            }}
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

      {/* Diskretan podsetnik na gestove — samo desktop, ne smeta stablu */}
      <p className="zb-label pointer-events-none absolute bottom-[18px] left-1/2 z-10 hidden -translate-x-1/2 text-[10px] whitespace-nowrap text-faint md:block">
        {STR.tree.hint}
      </p>

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

      {ctxMenu !== null &&
        (() => {
          const ctxPerson = tree.persons.find((p) => p.id === ctxMenu.id);
          if (!ctxPerson) return null;
          const branchIds =
            mainId !== null ? collectBranchIds(tree, ctxMenu.id, mainId) : null;
          return (
            <TreeContextMenu
              person={ctxPerson}
              x={ctxMenu.x}
              y={ctxMenu.y}
              canWrite={canWrite}
              branchCount={branchIds === null ? null : branchIds.length}
              onClose={() => setCtxMenu(null)}
              onEdit={(id) => navigate(`/person/${id}/edit`)}
              onAddChild={(id) => navigate(`/person/new?childOf=${id}`)}
              onAddSpouse={(id) => {
                const p = tree.persons.find((x) => x.id === id);
                if (p) setAddSpouseTarget(p);
              }}
              onAddParent={(id) => navigate(`/person/new?parentOf=${id}`)}
              onHide={hideBranch}
              onShowFromHere={focusPerson}
            />
          );
        })()}

      {addSpouseTarget && (
        <AddSpouseDialog
          open={Boolean(addSpouseTarget)}
          onClose={() => setAddSpouseTarget(null)}
          person={addSpouseTarget}
        />
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
