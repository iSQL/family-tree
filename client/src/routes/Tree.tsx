import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useQueryClient } from '@tanstack/react-query';
import { HeartHandshake, Keyboard, Plus, Printer, Sprout, TreeDeciduous } from 'lucide-react';
import { toast } from 'sonner';
import type { PersonSlim, TreeResponse } from '@shared/types';
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
import { useUndo } from '../hooks/useMutations';
import { TreeCanvas, type CardAddKind, type TreeCanvasHandle } from '../components/tree/TreeCanvas';
import { TreeContextMenu } from '../components/tree/TreeContextMenu';
import { TreeControls } from '../components/tree/TreeControls';
import { AddMenu } from '../components/tree/AddMenu';
import { ShortcutsDialog } from '../components/tree/ShortcutsDialog';
import { FamilyChooser } from '../components/family/FamilyChooser';
import { KinshipPanel } from '../components/tree/KinshipPanel';
import { PersonDrawer } from '../components/person/PersonDrawer';
import { PersonSheet } from '../components/person/PersonSheet';
import {
  QuickAddPanel,
  type QuickAddKind,
  type QuickAddRequest,
  type QuickAddSaved,
} from '../components/quickadd/QuickAddPanel';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

/** Koliko dugo upravo dodata kartica nosi oreol „NOVO". */
const HIGHLIGHT_MS = 4000;
/** Vodič „Počni od sebe": ja → roditelji → bake i deke. */
const WIZARD_STEPS = 3;

const nameOf = (p: PersonSlim | undefined) => (p ? `${p.first_name} ${p.last_name}`.trim() : '?');

export default function TreePage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  const isDesktop = useIsDesktop();
  const readonly = useReadonly();
  const canWrite = useCanWrite();
  const undo = useUndo();
  const canvasRef = useRef<TreeCanvasHandle>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [focusHistory, setFocusHistory] = useState<number[]>([]);
  // Mod „Srodstvo": izbor do dve osobe u stablu za prikaz njihovog srodstva.
  const [kinshipMode, setKinshipMode] = useState(false);
  const [kinshipSel, setKinshipSel] = useState<number[]>([]);
  // Kontekst meni nad karticom (desni klik / dugi pritisak).
  const [ctxMenu, setCtxMenu] = useState<{ id: number; x: number; y: number } | null>(null);
  // Brzi unos srodnika (panel na mestu detalja) i meni plutajućeg dugmeta.
  const [quickAdd, setQuickAdd] = useState<QuickAddRequest | null>(null);
  const [addMenu, setAddMenu] = useState<{ anchorId: number; from: DOMRect } | null>(null);
  // Vodič „Počni od sebe" — osobe kojima još treba upisati roditelje (bake i deke).
  const [wizardQueue, setWizardQueue] = useState<number[]>([]);
  const [highlightIds, setHighlightIds] = useState<number[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
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
  // `extra` se spaja u isti upis URL-a (dva odvojena upisa bi se međusobno pregazila).
  const focusPerson = useCallback(
    (id: number, extra: Record<string, string | null> = {}) => {
      if (focusId !== null && focusId !== id) setFocusHistory((h) => [...h, focusId]);
      // Fokusirana osoba mora biti vidljiva — vrati grane koje je skrivaju.
      setHiddenBranches((brs) => brs.filter((b) => !b.ids.includes(id)));
      mergeParams({ ...extra, focus: String(id) });
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
      else {
        setQuickAdd(null);
        setSelectedId(id);
      }
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
      setQuickAdd(null);
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

  // Otvori brzi unos — kontekst meni i meni dugmeta se zatvaraju.
  const openQuickAdd = useCallback((kind: QuickAddKind, anchorId: number | null) => {
    setCtxMenu(null);
    setAddMenu(null);
    setQuickAdd({ kind, anchorId });
  }, []);

  // Prikaži osobu: ako je iscrtana — pomeri kameru do nje, inače re-root; otvori detalje.
  const showPerson = useCallback(
    (id: number) => {
      if (!canvasRef.current?.ensureVisible(id)) focusPerson(id);
      setQuickAdd(null);
      setSelectedId(id);
    },
    [focusPerson],
  );

  // Najsvežije stablo iz keša — handleri posle upisa ne smeju da čitaju zastareli `tree`.
  const freshTree = useCallback(
    () => queryClient.getQueryData<TreeResponse>(['tree']) ?? tree,
    [queryClient, tree],
  );

  // Sledeći korak vodiča „Počni od sebe" posle upisa ili preskakanja koraka.
  const advanceWizard = useCallback(
    (current: QuickAddRequest, savedPrimary: number | null) => {
      const t = freshTree();
      const step = current.wizard?.step ?? WIZARD_STEPS;
      const finish = () => {
        setQuickAdd(null);
        setWizardQueue([]);
        toast.success(STR.quickAdd.wizardDone);
      };
      const askParents = (anchorId: number, queue: number[]) => {
        const anchor = t?.persons.find((p) => p.id === anchorId);
        setWizardQueue(queue);
        setQuickAdd({
          kind: 'parents',
          anchorId,
          wizard: {
            step: step === 1 ? 2 : WIZARD_STEPS,
            total: WIZARD_STEPS,
            title: step === 1 ? nameOf(anchor) : `${STR.quickAdd.wizardGrandparents} — ${nameOf(anchor)}`,
          },
        });
      };
      if (step === 1) {
        if (savedPrimary === null) return finish();
        focusPerson(savedPrimary);
        return askParents(savedPrimary, []);
      }
      let queue = wizardQueue;
      if (step === 2 && current.anchorId !== null) {
        const me = t?.persons.find((p) => p.id === current.anchorId);
        queue = [me?.father_id ?? null, me?.mother_id ?? null].filter((x): x is number => x !== null);
      }
      const [next, ...rest] = queue;
      if (next === undefined) return finish();
      askParents(next, rest);
    },
    [freshTree, focusPerson, wizardQueue],
  );

  // Posle brzog unosa: fokus ostaje (Predlog 3), nova kartica se ističe, toast sa „Poništi".
  const handleSaved = useCallback(
    (saved: QuickAddSaved) => {
      setHighlightIds(saved.ids);
      if (saved.request.wizard) advanceWizard(saved.request, saved.primaryId);
      else if (!saved.keepOpen) setQuickAdd(null);
      // Sačekaj da f3 iscrta novu karticu, pa pomeri kameru samo ako je van ekrana.
      window.setTimeout(() => canvasRef.current?.ensureVisible(saved.primaryId), 650);
      toast.success(`${saved.created ? STR.quickAdd.added : STR.quickAdd.linked} ${saved.label}`, {
        duration: 8000,
        action: {
          label: STR.quickAdd.undo,
          onClick: () => undo.mutate(saved.undo, { onSuccess: () => setHighlightIds([]) }),
        },
        cancel: { label: STR.quickAdd.show, onClick: () => showPerson(saved.primaryId) },
      });
    },
    [advanceWizard, showPerson, undo],
  );

  // Oreol „NOVO" se gasi posle nekoliko sekundi.
  useEffect(() => {
    if (highlightIds.length === 0) return;
    const t = window.setTimeout(() => setHighlightIds([]), HIGHLIGHT_MS);
    return () => window.clearTimeout(t);
  }, [highlightIds]);

  // „Skoči na osobu" iz pretrage (?find=) — centriraj bez re-roota ako je osoba
  // već iscrtana, inače je postavi za glavnu osobu.
  const findParam = searchParams.get('find');
  useEffect(() => {
    if (findParam === null || !tree) return;
    const id = Number(findParam);
    if (!Number.isFinite(id) || !tree.persons.some((p) => p.id === id)) {
      mergeParams({ find: null });
      return;
    }
    if (canvasRef.current?.centerOn(id)) mergeParams({ find: null });
    else focusPerson(id, { find: null });
    setQuickAdd(null);
    setSelectedId(id);
    setHighlightIds([id]);
  }, [findParam, tree, mergeParams, focusPerson]);

  // Prečice sa tastature za izabranu (ili fokusiranu) osobu: D/Z dete, S/X supružnik,
  // R roditelji, B brat/sestra, E izmena, ? spisak prečica. Ignoriše unos u poljima,
  // offline, režim pregleda i otvoren brzi unos.
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
      if (e.key === '?') {
        e.preventDefault();
        setShortcutsOpen(true);
        return;
      }
      if (kinshipMode || quickAdd !== null || shortcutsOpen) return;

      const kinds: Record<string, QuickAddKind | 'edit'> = {
        d: 'child',
        z: 'child',
        s: 'spouse',
        x: 'spouse',
        r: 'parents',
        b: 'sibling',
        e: 'edit',
      };
      const action = kinds[e.key.toLowerCase()];
      if (!action) return;

      const anchorId = selectedId ?? focusId;
      if (anchorId === null || !canWrite) return;

      e.preventDefault();
      if (action === 'edit') navigate(`/person/${anchorId}/edit`);
      else openQuickAdd(action, anchorId);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedId, focusId, canWrite, navigate, kinshipMode, toggleKinshipMode, quickAdd, shortcutsOpen, openQuickAdd]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base text-muted">{STR.tree.loadFailed}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  const quickAddPanel = quickAdd && (
    <QuickAddPanel
      request={quickAdd}
      tree={tree}
      isDesktop={isDesktop}
      onClose={() => {
        setQuickAdd(null);
        setWizardQueue([]);
      }}
      onSaved={handleSaved}
      onChangeKind={(kind) => setQuickAdd((q) => (q ? { ...q, kind } : q))}
      onSkip={quickAdd.wizard ? () => advanceWizard(quickAdd, null) : undefined}
    />
  );

  const shortcutsDialog = (
    <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
  );

  let body;
  if (tree.persons.length === 0) {
    body = (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <TreeDeciduous size={56} className="text-faint" aria-hidden="true" />
        <div>
          <h2 className="font-display text-xl font-normal text-heading">{STR.tree.emptyTitle}</h2>
          <p className="mt-1 text-base text-muted">{STR.tree.emptyText}</p>
        </div>
        {!readonly && (
          <Button
            onClick={() =>
              setQuickAdd({
                kind: 'free',
                anchorId: null,
                wizard: { step: 1, total: WIZARD_STEPS, title: STR.quickAdd.wizardSelf },
              })
            }
          >
            <Sprout size={16} aria-hidden="true" />
            {STR.quickAdd.wizardStart}
          </Button>
        )}
      </div>
    );
  } else if (focusId === null) {
    // Bez fokusa → landing: izbor porodice. Stablo se prikazuje tek kad je osoba izabrana.
    body = <FamilyChooser tree={tree} onPick={focusPerson} />;
  } else {
    const sheetOpen = !isDesktop && selectedId !== null && quickAdd === null;
    const activeId = kinshipMode ? null : (quickAdd?.anchorId ?? selectedId);
    const fabAnchorId = selectedId ?? focusId;

    body = (
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
          activeId={activeId}
          highlightIds={highlightIds}
          onPersonAdd={canWrite ? (id: number, kind: CardAddKind) => openQuickAdd(kind, id) : undefined}
          controlRef={canvasRef}
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

        {/* Gore-desno: prečice, izvoz postera (trenutni prikaz) + prekidač moda „Srodstvo" */}
        <div className="absolute top-3 right-3 z-20 flex gap-2">
          {!kinshipMode && isDesktop && (
            <Button
              variant="secondary"
              size="sm"
              className="shadow-lg"
              onClick={() => setShortcutsOpen(true)}
              aria-label={STR.tree.shortcutsButton}
              title={`${STR.tree.shortcutsButton} (?)`}
            >
              <Keyboard size={16} aria-hidden="true" />
            </Button>
          )}
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

        {/* Plutajuće dugme „Kome?" — sakriveno uz sheet, brzi unos, mod „Srodstvo" i režim pregleda */}
        {!sheetOpen && !readonly && !kinshipMode && quickAdd === null && (
          <Button
            onClick={(e) => {
              const from = e.currentTarget.getBoundingClientRect();
              if (tree.persons.some((p) => p.id === fabAnchorId)) setAddMenu({ anchorId: fabAnchorId, from });
              else openQuickAdd('free', null);
            }}
            className="absolute bottom-4 left-4 z-10 rounded-full shadow-lg sm:rounded-lg"
            aria-label={STR.tree.addPerson}
            aria-haspopup="menu"
          >
            <Plus size={16} aria-hidden="true" />
            <span className="hidden sm:inline">{STR.tree.addPerson}</span>
          </Button>
        )}

        {addMenu !== null &&
          (() => {
            const anchor = tree.persons.find((p) => p.id === addMenu.anchorId);
            if (!anchor) return null;
            return (
              <AddMenu
                anchor={anchor}
                from={addMenu.from}
                onClose={() => setAddMenu(null)}
                onPick={(kind) => openQuickAdd(kind, anchor.id)}
                onUnlinked={() => openQuickAdd('free', null)}
              />
            );
          })()}

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
                onAddChild={(id) => openQuickAdd('child', id)}
                onAddSpouse={(id) => openQuickAdd('spouse', id)}
                onAddParent={(id) => openQuickAdd('parents', id)}
                onAddSibling={(id) => openQuickAdd('sibling', id)}
                onHide={hideBranch}
                onShowFromHere={focusPerson}
              />
            );
          })()}

        {isDesktop && selectedId !== null && quickAdd === null && (
          <PersonDrawer
            personId={selectedId}
            onClose={() => setSelectedId(null)}
            onFocusPerson={handleRelativeClick}
            onShowInTree={focusPerson}
            onQuickAdd={canWrite ? openQuickAdd : undefined}
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
            onQuickAdd={canWrite ? openQuickAdd : undefined}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {body}
      {quickAddPanel}
      {shortcutsDialog}
    </div>
  );
}
