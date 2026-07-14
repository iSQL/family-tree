/**
 * Štampa / PDF poster — panel sa opcijama + živi pregled lista. „Štampaj" i
 * „Preuzmi PDF" otvaraju sistemski dijalog štampe (PDF preko „Sačuvaj kao PDF");
 * poster se za štampu renderuje u skrivenom portalu skaliran na fizičke mm.
 *
 * Obimi: trenutni prikaz (fokus + generacije), cela loza, preci, potomci,
 * izabrani čvorovi (klik na kartice u pregledu) i veza srodstva (kalkulator).
 */
import { useMemo, useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { Download, Info, Printer, X } from 'lucide-react';
import type { PersonSlim, TreeResponse } from '@shared/types';
import { chooserFamilies, familyMemberIds, filterTreeToFamily } from '@shared/families';
import { posterSubtree, type PosterScope } from '@shared/posterScope';
import { comparePartialDates } from '@shared/partialDate';
import { maxDescendantDepth, resolveProgenyDepth } from '@shared/treeView';
import { describeKinships, type KinshipResult } from '@shared/kinship';
import { buildConnectionView } from '@shared/kinship/connection';
import { useTree } from '../hooks/useTree';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { calcPosterLayout } from '../lib/posterLayout';
import { PosterSheet, type PosterContent, type PosterExtras } from '../components/poster/PosterSheet';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

type Paper = 'A4' | 'A3' | 'A2' | 'A1' | 'tiling';
type Orient = 'portrait' | 'landscape';

/** Kraća stranica A-formata u mm (duža = kraća × √2). */
const PAPER_SHORT_MM: Record<Exclude<Paper, 'tiling'>, number> = { A4: 210, A3: 297, A2: 420, A1: 594 };
const PAPER_LABEL: Record<Paper, string> = {
  A4: 'A4 · 210 × 297 mm',
  A3: 'A3 · 297 × 420 mm',
  A2: 'A2 · 420 × 594 mm',
  A1: 'A1 · 594 × 841 mm',
  tiling: STR.poster.paperTilingLabel,
};

/** Logičke px dimenzije lista u pregledu/štampi (odnos √2 kao A-formati). */
const BASE_SHORT = 600;
const BASE_LONG = 849;
/** CSS px po mm (1in = 96px = 25.4mm). */
const MM_TO_PX = 96 / 25.4;

const EMPTY_TREE: TreeResponse = { persons: [], unions: [] };

/** Fizička veličina postera u mm — „Više A4" se štampa kao A2 u 4 × A4. */
function posterMm(paper: Paper, orient: Orient): { w: number; h: number } {
  const short = paper === 'tiling' ? PAPER_SHORT_MM.A2 : PAPER_SHORT_MM[paper];
  const long = Math.round(short * Math.SQRT2);
  return orient === 'portrait' ? { w: short, h: long } : { w: long, h: short };
}

const SCOPES: { v: PosterScope; label: string; hint: string }[] = [
  { v: 'view', label: STR.poster.scopeView, hint: STR.poster.scopeViewHint },
  { v: 'lineage', label: STR.poster.scopeLineage, hint: STR.poster.scopeLineageHint },
  { v: 'ancestors', label: STR.poster.scopeAncestors, hint: STR.poster.scopeAncestorsHint },
  { v: 'descendants', label: STR.poster.scopeDescendants, hint: STR.poster.scopeDescendantsHint },
  { v: 'selected', label: STR.poster.scopeSelected, hint: STR.poster.scopeSelectedHint },
  { v: 'kinship', label: STR.poster.scopeKinship, hint: STR.poster.scopeKinshipHint },
];

const SCOPE_VALUES = new Set<string>(SCOPES.map((s) => s.v));

function parseIdParam(value: string | null, tree: TreeResponse): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && tree.persons.some((p) => p.id === n) ? n : null;
}

function safeKinships(tree: TreeResponse, fromId: number, toId: number): KinshipResult[] {
  try {
    return describeKinships(tree, fromId, toId);
  } catch {
    return [];
  }
}

function personLabel(p: PersonSlim): string {
  const year = p.birth_date !== null ? ` (${p.birth_date.slice(0, 4)})` : '';
  return `${p.first_name} ${p.last_name}${year}`;
}

interface PrintJob {
  paper: Paper;
  orient: Orient;
}

/**
 * Skriveni portal za štampu: list skaliran na mm + @page pravilo; poziva
 * window.print() kad se slike učitaju, a gasi se na afterprint.
 */
function PosterPrint({
  job,
  sheet,
  onDone,
}: {
  job: PrintJob;
  sheet: Omit<Parameters<typeof PosterSheet>[0], 'width' | 'height'>;
  onDone: () => void;
}) {
  const { w: posterW, h: posterH } = posterMm(job.paper, job.orient);
  const tiling = job.paper === 'tiling';
  // Stranica štampe: ceo poster, ili A4 četvrtina postera kod lepljenja.
  const pageW = tiling ? posterW / 2 : posterW;
  const pageH = tiling ? posterH / 2 : posterH;
  const baseW = job.orient === 'portrait' ? BASE_SHORT : BASE_LONG;
  const baseH = job.orient === 'portrait' ? BASE_LONG : BASE_SHORT;
  const scale = (posterW * MM_TO_PX) / baseW;

  useEffect(() => {
    document.body.classList.add('poster-printing');
    window.addEventListener('afterprint', onDone);
    let cancelled = false;
    void (async () => {
      const imgs = Array.from(document.querySelectorAll<HTMLImageElement>('.poster-print-root img'));
      await Promise.allSettled(imgs.map((im) => im.decode()));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      if (!cancelled) window.print();
    })();
    return () => {
      cancelled = true;
      document.body.classList.remove('poster-printing');
      window.removeEventListener('afterprint', onDone);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const quadrants = tiling
    ? [
        { r: 0, c: 0 },
        { r: 0, c: 1 },
        { r: 1, c: 0 },
        { r: 1, c: 1 },
      ]
    : [{ r: 0, c: 0 }];

  return createPortal(
    <div className="poster-print-root">
      <style>{`@page { size: ${pageW}mm ${pageH}mm; margin: 0; }`}</style>
      {quadrants.map(({ r, c }) => (
        <div
          key={`${r}${c}`}
          className="poster-page"
          style={{ width: `${pageW}mm`, height: `${pageH}mm`, overflow: 'hidden' }}
        >
          <div style={{ transform: `translate(${-c * pageW}mm, ${-r * pageH}mm)` }}>
            <div style={{ transform: `scale(${scale})`, transformOrigin: 'top left', width: baseW }}>
              <PosterSheet {...sheet} width={baseW} height={baseH} />
            </div>
          </div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

/** Radio/checkbox red u panelu opcija. */
function OptionRow({
  type,
  name,
  checked,
  onChange,
  label,
}: {
  type: 'radio' | 'checkbox';
  name?: string;
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 py-1 text-sm">
      <input
        type={type}
        name={name}
        checked={checked}
        onChange={onChange}
        className="size-4 shrink-0 cursor-pointer accent-amber-700"
      />
      <span>{label}</span>
    </label>
  );
}

/** Segment dugme (veličina papira / orijentacija). */
function SegButton({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`cursor-pointer rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors ${
        active
          ? 'border-amber-700 bg-amber-700 text-white'
          : 'border-stone-300 bg-white text-stone-700 hover:bg-stone-50 dark:border-stone-600 dark:bg-stone-800 dark:text-stone-200 dark:hover:bg-stone-700'
      }`}
    >
      {children}
    </button>
  );
}

/** Mala labela iznad kontrole u panelu. */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return <span className="mb-1 block text-xs font-medium text-stone-500 dark:text-stone-400">{children}</span>;
}

function PosterPageInner({ tree }: { tree: TreeResponse }) {
  const [searchParams] = useSearchParams();
  const focusId = parseIdParam(searchParams.get('focus'), tree);
  const scopeParam = searchParams.get('scope');
  const downParam = searchParams.get('down');

  const families = useMemo(() => chooserFamilies(tree), [tree]);
  const byId = useMemo(() => new Map(tree.persons.map((p) => [p.id, p])), [tree]);
  const allSorted = useMemo(
    () =>
      tree.persons
        .slice()
        .sort((a, b) =>
          `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'sr') || a.id - b.id,
        ),
    [tree],
  );

  const [repState, setRepState] = useState<number | null>(null);
  const [personState, setPersonState] = useState<number | null>(focusId);
  const [scope, setScope] = useState<PosterScope>(
    scopeParam !== null && SCOPE_VALUES.has(scopeParam) ? (scopeParam as PosterScope) : focusId !== null ? 'view' : 'lineage',
  );
  const [paper, setPaper] = useState<Paper>('A2');
  const [orient, setOrient] = useState<Orient>('portrait');
  const [content, setContent] = useState<PosterContent>({
    photos: true,
    years: true,
    title: true,
    birthplace: false,
    genderColors: true,
  });
  const [extras, setExtras] = useState<PosterExtras>({
    title: true,
    subtitle: true,
    legend: true,
    frame: true,
    watermark: true,
  });
  const [titleOverride, setTitleOverride] = useState<string | null>(null);
  const [printJob, setPrintJob] = useState<PrintJob | null>(null);

  // Obim 'view': broj generacija potomaka (null = automatski, kao stranica stabla).
  const [depthOverride, setDepthOverride] = useState<number | null>(null);
  // Obim 'selected': izabrane osobe + režim pregleda (izbor / finalni poster).
  const [selection, setSelection] = useState<ReadonlySet<number>>(new Set());
  const [pickMode, setPickMode] = useState(true);
  // Obim 'kinship': dve osobe (iz kalkulatora preko ?a/?b, ili izbor ovde) + izabrana
  // linija srodstva (dvostruko/višestruko srodstvo; ?line=).
  const [kinA, setKinA] = useState<number | null>(parseIdParam(searchParams.get('a'), tree));
  const [kinB, setKinB] = useState<number | null>(parseIdParam(searchParams.get('b'), tree));
  const initialLine = Number(searchParams.get('line'));
  const [kinLine, setKinLine] = useState<number>(Number.isInteger(initialLine) && initialLine >= 0 ? initialLine : 0);

  // Aktivna porodica: eksplicitan izbor > porodica fokusirane osobe > prva.
  const repId = useMemo(() => {
    if (repState !== null && families.some((f) => f.representativeId === repState)) return repState;
    const seed = personState ?? focusId;
    if (seed !== null) {
      const seedFamily = familyMemberIds(tree, seed);
      const hit = families.find((f) => seedFamily.has(f.representativeId));
      if (hit) return hit.representativeId;
    }
    return families[0]?.representativeId ?? null;
  }, [repState, families, personState, focusId, tree]);

  // Članovi porodice za izbor glavne osobe (po rođenju pa imenu).
  const members = useMemo(() => {
    if (repId === null) return [];
    return filterTreeToFamily(tree, repId).persons.slice().sort((a, b) => {
      const cmp = comparePartialDates(a.birth_date, b.birth_date);
      if (cmp !== 0) return cmp;
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`, 'sr');
    });
  }, [tree, repId]);

  const mainSel =
    personState !== null && members.some((p) => p.id === personState) ? personState : (repId ?? tree.persons[0]?.id);

  // 'view': efektivna dubina potomaka — ista logika kao stranica stabla.
  const maxProgeny = useMemo(
    () => (mainSel !== undefined ? maxDescendantDepth(tree.persons, mainSel) : 0),
    [tree, mainSel],
  );
  const viewDepth = resolveProgenyDepth(
    tree.persons.length,
    depthOverride ?? (downParam === null ? null : Number(downParam)),
    maxProgeny,
  );

  // 'kinship': sve nezavisne linije srodstva (dvostruko/višestruko).
  const kinLines = useMemo(() => {
    if (scope !== 'kinship' || kinA === null || kinB === null || kinA === kinB) return [];
    return safeKinships(tree, kinA, kinB);
  }, [scope, tree, kinA, kinB]);
  // Izabrana linija, ograničena na opseg.
  const lineIndex = kinLine >= 0 && kinLine < kinLines.length ? kinLine : 0;
  // Veza srodstva izabrane linije → podskup + prevoj kao glavna osoba.
  const connView = useMemo(() => {
    const result = kinLines[lineIndex];
    if (result === undefined) return null;
    return buildConnectionView(tree, result);
  }, [tree, kinLines, lineIndex]);

  // Loza (za 'view'/'lineage' i kao osnova za biranje čvorova kod 'selected').
  const lineageTree = useMemo(
    () => (mainSel !== undefined ? posterSubtree(tree, 'lineage', mainSel) : EMPTY_TREE),
    [tree, mainSel],
  );
  // Glavna osoba i stablo za FINALNI poster, po obimu.
  const anchor = scope === 'selected' ? ([...selection][0] ?? mainSel) : scope === 'kinship' ? connView?.mainId : mainSel;
  const finalTree = useMemo(() => {
    if (anchor === undefined) return EMPTY_TREE;
    switch (scope) {
      case 'kinship':
        return connView?.tree ?? EMPTY_TREE;
      case 'selected':
        return posterSubtree(tree, 'selected', anchor, selection);
      case 'view':
      case 'lineage':
        return lineageTree;
      default:
        return posterSubtree(tree, scope, anchor);
    }
  }, [scope, tree, anchor, selection, connView, lineageTree]);

  const finalLayout = useMemo(() => {
    if (anchor === undefined || finalTree.persons.length === 0) return null;
    return calcPosterLayout(finalTree, anchor, scope === 'view' ? { progenyDepth: viewDepth } : {});
  }, [finalTree, anchor, scope, viewDepth]);

  if (mainSel === undefined) {
    return <p className="p-6 text-sm text-stone-500 dark:text-stone-400">{STR.poster.emptyTree}</p>;
  }

  const rep = repId !== null ? byId.get(repId) : undefined;
  const defaultTitle = `${STR.poster.defaultTitlePrefix} ${rep?.last_name.trim() || rep?.first_name || ''}`.trim();
  const posterTitle = titleOverride ?? defaultTitle;

  const previewW = orient === 'portrait' ? BASE_SHORT : BASE_LONG;
  const previewH = orient === 'portrait' ? BASE_LONG : BASE_SHORT;

  const toggleSelect = (id: number) => {
    setSelection((sel) => {
      const next = new Set(sel);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Izbor čvorova: u pick režimu pregled prikazuje CELU lozu sa isticanjem.
  const picking = scope === 'selected' && pickMode;
  // Neke izabrane osobe f3 ne može da poveže sa prvom izabranom → ispadaju.
  const disconnected =
    scope === 'selected' && finalLayout !== null && selection.size > 0 && finalLayout.nodes.length < selection.size;

  const highlightIds = scope === 'selected' ? [...selection] : scope === 'kinship' && kinA !== null && kinB !== null ? [kinA, kinB] : undefined;
  const highlightLegend = scope === 'selected' ? STR.poster.legendSelected : scope === 'kinship' ? STR.poster.legendKinship : null;

  const sheetProps = {
    layout: finalLayout ?? { nodes: [], lines: [], width: 1, height: 1 },
    mainId: anchor ?? mainSel,
    content,
    extras,
    posterTitle,
    tilingGuides: paper === 'tiling',
    ...(highlightIds !== undefined ? { highlightIds } : null),
    highlightLegend,
  };

  const printBlocked =
    finalLayout === null ||
    finalLayout.nodes.length === 0 ||
    (scope === 'selected' && selection.size === 0) ||
    (scope === 'kinship' && connView === null);

  const startPrint = (pdfHint: boolean) => {
    if (printBlocked) return;
    if (pdfHint) toast.info(STR.poster.pdfHint, { duration: 6000 });
    // Kratka pauza da se toast iscrta pre nego što dijalog štampe blokira stranicu.
    window.setTimeout(() => setPrintJob({ paper, orient }), pdfHint ? 450 : 0);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden lg:flex-row">
      {/* PANEL OPCIJA */}
      <div className="w-full shrink-0 space-y-3.5 overflow-y-auto border-b border-stone-200 bg-stone-50 p-4 lg:w-[380px] lg:border-r lg:border-b-0 dark:border-stone-700 dark:bg-stone-900">
        <div>
          <div className="text-[11px] font-semibold tracking-wide text-stone-400">{STR.poster.kicker}</div>
          <h1 className="mt-0.5 text-lg font-bold">{STR.poster.title}</h1>
          <p className="mt-1.5 text-xs leading-relaxed text-stone-500 dark:text-stone-400">{STR.poster.intro}</p>
        </div>

        <Card>
          <CardHeader title={STR.poster.scopeSection} />
          <div className="space-y-2.5 p-4">
            {scope !== 'kinship' && families.length > 1 && (
              <label className="block text-sm">
                <FieldLabel>{STR.poster.familyLabel}</FieldLabel>
                <Select
                  value={repId ?? undefined}
                  onChange={(e) => {
                    setRepState(Number(e.target.value));
                    setPersonState(null);
                    setTitleOverride(null);
                    setSelection(new Set());
                  }}
                >
                  {families.map((f) => {
                    const r = byId.get(f.representativeId);
                    if (!r) return null;
                    return (
                      <option key={f.representativeId} value={f.representativeId}>
                        {r.last_name.trim() || r.first_name} · {f.size} {STR.tree.members}
                      </option>
                    );
                  })}
                </Select>
              </label>
            )}
            {scope !== 'kinship' && (
              <label className="block text-sm">
                <FieldLabel>{STR.poster.mainPersonLabel}</FieldLabel>
                <Select
                  value={mainSel}
                  onChange={(e) => {
                    setPersonState(Number(e.target.value));
                    setSelection(new Set());
                  }}
                >
                  {members.map((p) => (
                    <option key={p.id} value={p.id}>
                      {personLabel(p)}
                    </option>
                  ))}
                </Select>
              </label>
            )}
            <div>
              {SCOPES.map((s) => (
                <OptionRow
                  key={s.v}
                  type="radio"
                  name="poster-scope"
                  checked={scope === s.v}
                  onChange={() => {
                    setScope(s.v);
                    if (s.v === 'selected') setPickMode(true);
                  }}
                  label={s.label}
                />
              ))}
            </div>

            {/* 'view': broj generacija potomaka */}
            {scope === 'view' && (
              <label className="block text-sm">
                <FieldLabel>
                  {STR.poster.generationsLabel} (0–{maxProgeny})
                </FieldLabel>
                <Input
                  type="number"
                  min={0}
                  max={maxProgeny}
                  value={viewDepth}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    if (Number.isInteger(n)) setDepthOverride(Math.max(0, Math.min(maxProgeny, n)));
                  }}
                />
              </label>
            )}

            {/* 'selected': stanje izbora */}
            {scope === 'selected' && (
              <div className="flex items-center gap-2 text-xs text-stone-600 dark:text-stone-300">
                <span className="rounded-full bg-teal-100 px-2.5 py-1 font-semibold text-teal-800 dark:bg-teal-900 dark:text-teal-200">
                  {selection.size} {STR.poster.selectedCount}
                </span>
                {selection.size > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelection(new Set())}
                    className="inline-flex cursor-pointer items-center gap-1 text-stone-500 underline underline-offset-2 hover:text-stone-700 dark:hover:text-stone-200"
                  >
                    <X size={12} aria-hidden="true" />
                    {STR.poster.clearSelection}
                  </button>
                )}
              </div>
            )}

            {/* 'kinship': izbor dve osobe */}
            {scope === 'kinship' && (
              <div className="space-y-2">
                <label className="block text-sm">
                  <FieldLabel>{STR.kinship.personA}</FieldLabel>
                  <Select
                    value={kinA ?? ''}
                    onChange={(e) => {
                      setKinA(e.target.value === '' ? null : Number(e.target.value));
                      setKinLine(0);
                    }}
                  >
                    <option value="">{STR.common.none}</option>
                    {allSorted.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personLabel(p)}
                      </option>
                    ))}
                  </Select>
                </label>
                <label className="block text-sm">
                  <FieldLabel>{STR.kinship.personB}</FieldLabel>
                  <Select
                    value={kinB ?? ''}
                    onChange={(e) => {
                      setKinB(e.target.value === '' ? null : Number(e.target.value));
                      setKinLine(0);
                    }}
                  >
                    <option value="">{STR.common.none}</option>
                    {allSorted.map((p) => (
                      <option key={p.id} value={p.id}>
                        {personLabel(p)}
                      </option>
                    ))}
                  </Select>
                </label>
                {/* Dvostruko/višestruko srodstvo → izbor koje linije da se izvozi. */}
                {kinLines.length > 1 && (
                  <label className="block text-sm">
                    <FieldLabel>{STR.poster.kinshipLineLabel}</FieldLabel>
                    <Select value={lineIndex} onChange={(e) => setKinLine(Number(e.target.value))}>
                      {kinLines.map((ln, i) => (
                        <option key={i} value={i}>
                          {i + 1}. {ln.term ?? STR.kinship.lineWord}
                          {ln.viaLabel ? ` — ${STR.kinship.via} ${ln.viaLabel}` : ''}
                        </option>
                      ))}
                    </Select>
                  </label>
                )}
              </div>
            )}

            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 dark:border-amber-900 dark:bg-amber-950/40">
              <Info size={14} className="mt-0.5 shrink-0 text-amber-700 dark:text-amber-500" aria-hidden="true" />
              <span className="text-xs leading-snug text-amber-800 dark:text-amber-300">
                {scope === 'selected' && disconnected
                  ? STR.poster.selectionDisconnected
                  : scope === 'selected' && selection.size === 0
                    ? STR.poster.selectionEmpty
                    : scope === 'kinship' && (kinA === null || kinB === null || kinA === kinB)
                      ? STR.poster.kinshipMissing
                      : scope === 'kinship' && connView === null
                        ? STR.poster.kinshipUnavailable
                        : SCOPES.find((s) => s.v === scope)!.hint}
              </span>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={STR.poster.formatSection} />
          <div className="space-y-3 p-4">
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-400">{STR.poster.paperSize}</div>
              <div className="flex flex-wrap gap-1.5">
                {(['A4', 'A3', 'A2', 'A1', 'tiling'] as const).map((p) => (
                  <SegButton key={p} active={paper === p} onClick={() => setPaper(p)}>
                    {p === 'tiling' ? STR.poster.paperTiling : p}
                  </SegButton>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-[11px] font-semibold tracking-wide text-stone-400">{STR.poster.orientation}</div>
              <div className="flex gap-1.5">
                <SegButton active={orient === 'portrait'} onClick={() => setOrient('portrait')}>
                  {STR.poster.orientPortrait}
                </SegButton>
                <SegButton active={orient === 'landscape'} onClick={() => setOrient('landscape')}>
                  {STR.poster.orientLandscape}
                </SegButton>
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader title={STR.poster.contentSection} />
          <div className="grid grid-cols-2 gap-x-3 p-4 pt-3">
            {(
              [
                ['photos', STR.poster.contentPhotos],
                ['years', STR.poster.contentYears],
                ['title', STR.poster.contentTitle],
                ['birthplace', STR.poster.contentBirthplace],
                ['genderColors', STR.poster.contentGenderColors],
              ] as const
            ).map(([k, label]) => (
              <OptionRow
                key={k}
                type="checkbox"
                checked={content[k]}
                onChange={() => setContent((c) => ({ ...c, [k]: !c[k] }))}
                label={label}
              />
            ))}
          </div>
        </Card>

        <Card>
          <CardHeader title={STR.poster.extrasSection} />
          <div className="space-y-2 p-4 pt-3">
            <div>
              {(
                [
                  ['title', STR.poster.extraTitle],
                  ['subtitle', STR.poster.extraSubtitle],
                  ['legend', STR.poster.extraLegend],
                  ['frame', STR.poster.extraFrame],
                  ['watermark', STR.poster.extraWatermark],
                ] as const
              ).map(([k, label]) => (
                <OptionRow
                  key={k}
                  type="checkbox"
                  checked={extras[k]}
                  onChange={() => setExtras((x) => ({ ...x, [k]: !x[k] }))}
                  label={label}
                />
              ))}
            </div>
            {extras.title && (
              <label className="block text-sm">
                <FieldLabel>{STR.poster.titleLabel}</FieldLabel>
                <Input value={posterTitle} onChange={(e) => setTitleOverride(e.target.value)} />
              </label>
            )}
          </div>
        </Card>

        <div className="flex flex-col gap-2 pb-2">
          <Button onClick={() => startPrint(true)} disabled={printBlocked}>
            <Download size={16} aria-hidden="true" />
            {STR.poster.downloadPdf}
          </Button>
          <Button variant="secondary" onClick={() => startPrint(false)} disabled={printBlocked}>
            <Printer size={16} aria-hidden="true" />
            {STR.poster.print}
          </Button>
        </div>
      </div>

      {/* PREGLED */}
      <div className="flex flex-1 flex-col items-center gap-3.5 overflow-auto bg-stone-200 p-6 dark:bg-stone-800">
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs font-semibold text-stone-600 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-300">
            {PAPER_LABEL[paper]}
          </span>
          <span className="rounded-full border border-stone-300 bg-white px-3 py-1 text-xs text-stone-500 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-400">
            {orient === 'portrait' ? STR.poster.orientPortrait : STR.poster.orientLandscape}
          </span>
          {scope === 'selected' && (
            <div className="flex gap-1.5">
              <SegButton active={pickMode} onClick={() => setPickMode(true)}>
                {STR.poster.pickModeBadge}
              </SegButton>
              <SegButton active={!pickMode} onClick={() => setPickMode(false)}>
                {STR.poster.previewBadge}
              </SegButton>
            </div>
          )}
        </div>
        {picking ? (
          // Režim izbora: interaktivno stablo (zum točkićem, prevlačenje, klik bira) —
          // isti prikaz kao glavna stranica stabla, pa se i veliko stablo lako pregleda.
          <div className="relative min-h-[420px] w-full flex-1 self-stretch overflow-hidden rounded-xl border border-stone-300 shadow-2xl dark:border-stone-600">
            <TreeCanvas
              tree={lineageTree}
              focusId={mainSel}
              onPersonClick={toggleSelect}
              selectedIds={[...selection]}
            />
            <span className="pointer-events-none absolute top-2 left-2 rounded-full bg-teal-700/90 px-2.5 py-1 text-[11px] font-semibold text-white">
              {STR.poster.pickModeHint}
            </span>
          </div>
        ) : (
          <div className="shadow-2xl">
            <PosterSheet {...sheetProps} width={previewW} height={previewH} />
          </div>
        )}
      </div>

      {printJob && <PosterPrint job={printJob} sheet={sheetProps} onDone={() => setPrintJob(null)} />}
    </div>
  );
}

export default function PosterPage() {
  const { data: tree, isPending } = useTree();
  if (isPending) return <FullScreenSpinner />;
  if (!tree || tree.persons.length === 0) {
    return <p className="p-6 text-sm text-stone-500 dark:text-stone-400">{STR.poster.emptyTree}</p>;
  }
  return <PosterPageInner tree={tree} />;
}
