/**
 * Wrapper oko family-chart@0.9.0 — JEDINI fajl koji uvozi 'family-chart'.
 * API (provereno u node_modules/family-chart/dist): f3.createChart(cont, data)
 * → Chart; setCardHtml() → CardHtml sa setCardInnerHtmlCreator za naše kartice;
 * legacy rels format {father, mother, spouses, children} se interno konvertuje.
 */
import { useEffect, useMemo, useRef } from 'react';
import f3 from 'family-chart';
import 'family-chart/styles/family-chart.css';
import type { TreeResponse } from '@shared/types';
import { toF3, type F3Datum } from '../../lib/toF3';
import { formatLifespan } from '../../lib/dates';
import { STR } from '../../lib/strings';

type Chart = ReturnType<typeof f3.createChart>;
type F3Data = Parameters<typeof f3.createChart>[1];

export interface TreeCanvasProps {
  tree: TreeResponse;
  /** ?focus=:id — centriraj osobu kao glavnu. */
  focusId: number | null;
  /** Jednostruki klik — otvara detalje. */
  onPersonClick: (id: number) => void;
  /** Dupli klik — re-root stabla na tu osobu. */
  onPersonActivate?: (id: number) => void;
  /** Desni klik / dugi pritisak — kontekst meni; (x, y) su viewport koordinate. */
  onPersonContextMenu?: (id: number, x: number, y: number) => void;
  /** Klik na „−" na kartici — sakrij granu te osobe. */
  onPersonHide?: (id: number) => void;
  /** Glavna osoba + preci — na njihovim karticama se „−" ne prikazuje. */
  protectedIds?: number[];
  /** ID-jevi istaknutih čvorova (izbor za kalkulator srodstva). */
  selectedIds?: number[];
  /** Broj generacija potomaka od glavne osobe; undefined = neograničeno. Preci su uvek u celosti. */
  progenyDepth?: number;
}

const EMPTY_IDS: number[] = [];

const ESC_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

function esc(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESC_MAP[c] ?? c);
}

/** Rodni SVG placeholder (silueta) kad osoba nema sliku — boje prate temu. */
function placeholderSvg(gender: F3Datum['data']['gender']): string {
  const fill =
    gender === 'M' ? 'var(--zb-male)' : gender === 'F' ? 'var(--zb-female)' : 'var(--zb-unknown)';
  return `<svg class="ft-card-ph" viewBox="0 0 44 44" aria-hidden="true">
    <circle cx="22" cy="22" r="22" fill="${fill}" opacity="0.15"/>
    <circle cx="22" cy="17" r="7" fill="${fill}"/>
    <path d="M8 40c1.5-9 7.5-13 14-13s12.5 4 14 13" fill="${fill}"/>
  </svg>`;
}

// Kartica je čista funkcija PODATAKA — isticanje izbora (.ft-card-selected) NE ulazi
// ovde, već ga posebno (de)aktivira efekat ispod prebacivanjem klase u DOM-u. Tako
// promena izbora nikad ne regeneriše HTML kartica.
function cardInnerHtml(datum: F3Datum, isMain: boolean): string {
  const p = datum.data;
  const name = esc(`${p.first_name} ${p.last_name}`.trim()) || '?';
  const title = p.title ? ` <span class="ft-card-title">${esc(p.title)}</span>` : '';
  const years = formatLifespan(p.birth_date, p.death_date);
  const img = p.photo_id
    ? `<img class="ft-card-img" src="/api/photos/${encodeURIComponent(p.photo_id)}?size=thumb" alt="" loading="lazy">`
    : placeholderSvg(p.gender);
  const genderClass = p.gender === 'M' ? 'ft-card-m' : p.gender === 'F' ? 'ft-card-f' : 'ft-card-u';
  const flags = isMain ? ' ft-card-main' : '';
  // „−" u uglu sakriva granu; CSS ga gasi na zaštićenim karticama (.ft-card-no-hide, main).
  const hideBtn = `<button type="button" class="ft-card-hide" title="${esc(STR.tree.hideBranch)}" aria-label="${esc(STR.tree.hideBranch)}">
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M5 12h14"/></svg>
  </button>`;
  return `<div class="ft-card ${genderClass}${flags}" data-person-id="${esc(datum.id)}">
    ${img}
    <div class="ft-card-text">
      <div class="ft-card-name">${name}${title}</div>
      ${years ? `<div class="ft-card-years">${years}</div>` : ''}
    </div>
    ${hideBtn}
  </div>`;
}

export function TreeCanvas({
  tree,
  focusId,
  onPersonClick,
  onPersonActivate,
  onPersonContextMenu,
  onPersonHide,
  protectedIds = EMPTY_IDS,
  selectedIds = EMPTY_IDS,
  progenyDepth,
}: TreeCanvasProps) {
  const contRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<Chart | null>(null);
  const firstRenderRef = useRef(true);
  const lastFocusRef = useRef<number | null>(null);

  // Stabilne reference ka handlerima — kartice žive van React-a.
  const clickRef = useRef(onPersonClick);
  clickRef.current = onPersonClick;
  const activateRef = useRef(onPersonActivate);
  activateRef.current = onPersonActivate;
  const contextRef = useRef(onPersonContextMenu);
  contextRef.current = onPersonContextMenu;
  const hideRef = useRef(onPersonHide);
  hideRef.current = onPersonHide;
  // Dubina se čita i u create-efektu ([] deps) — drži je u ref-u da izbegne stale closure.
  const progenyDepthRef = useRef(progenyDepth);
  progenyDepthRef.current = progenyDepth;

  // Primeni dubinu potomaka na chart. undefined se NAMERNO prosleđuje — f3 to tretira
  // kao neograničeno (vrednost se čita pri sledećem updateTree, tokom calcTree-a).
  const applyDepth = (chart: Chart): void => {
    chart.setProgenyDepth(progenyDepthRef.current as number);
  };

  const f3Data = useMemo(() => toF3(tree), [tree]);

  // Kreiranje grafikona (jednom po mount-u)
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;

    firstRenderRef.current = true;
    lastFocusRef.current = null;

    const chart = f3.createChart(cont, [] as unknown as F3Data);
    chart
      .setTransitionTime(600)
      .setCardXSpacing(260)
      .setCardYSpacing(170)
      .setOrientationVertical()
      .setSingleParentEmptyCard(false)
      .setShowSiblingsOfMain(true); // preci su uvek u celosti, pa braća/sestre uvek imaju roditelje
    applyDepth(chart); // pre prvog updateTree — prvi render je već potkresan

    const card = chart.setCardHtml();
    card.setCardInnerHtmlCreator((d) => {
      const datum = d.data as unknown as F3Datum & { main?: boolean };
      return cardInnerHtml(datum, datum.main === true);
    });
    card.setOnCardClick((_e: MouseEvent, d: { data: { id: string } }) => {
      const id = Number(d.data.id);
      if (Number.isFinite(id)) clickRef.current(id);
    });

    chartRef.current = chart;

    // ID osobe sa kartice ispod pokazivača (delegacija preživljava re-render kartica).
    const personIdAt = (target: EventTarget | null): number | null => {
      const card = (target as HTMLElement | null)?.closest<HTMLElement>('.ft-card');
      const raw = card?.dataset.personId;
      if (raw === undefined) return null;
      const id = Number(raw);
      return Number.isFinite(id) ? id : null;
    };

    // Dupli klik = re-root. family-chart nema dblclick API i zaustavlja propagaciju
    // u bubble fazi, pa slušamo u CAPTURE fazi na stabilnom kontejneru.
    const onDblClick = (e: MouseEvent) => {
      const id = personIdAt(e.target);
      if (id !== null) activateRef.current?.(id);
    };
    cont.addEventListener('dblclick', onDblClick, true);

    // Desni klik (i Android long-press, koji stiže kao contextmenu) = kontekst meni.
    const onContextMenu = (e: MouseEvent) => {
      const id = personIdAt(e.target);
      if (id === null || contextRef.current === undefined) return;
      e.preventDefault();
      e.stopPropagation();
      cancelLongPress(); // Android šalje i contextmenu i naš tajmer — ne otvaraj dvaput
      contextRef.current(id, e.clientX, e.clientY);
    };
    cont.addEventListener('contextmenu', onContextMenu, true);

    // Dugi pritisak (touch/pen) = kontekst meni — za iOS, koji ne šalje contextmenu.
    // Pomeranje prsta (pan/zoom) otkazuje; posle otvaranja gutamo sledeći click.
    let lpTimer: number | null = null;
    let lpStart: { x: number; y: number } | null = null;
    let swallowClick = false;
    const cancelLongPress = () => {
      if (lpTimer !== null) {
        clearTimeout(lpTimer);
        lpTimer = null;
      }
      lpStart = null;
    };
    const onPointerDown = (e: PointerEvent) => {
      if (e.pointerType === 'mouse') return;
      cancelLongPress();
      const id = personIdAt(e.target);
      if (id === null || contextRef.current === undefined) return;
      const { clientX, clientY } = e;
      lpStart = { x: clientX, y: clientY };
      lpTimer = window.setTimeout(() => {
        lpTimer = null;
        lpStart = null;
        swallowClick = true;
        contextRef.current?.(id, clientX, clientY);
      }, 500);
    };
    const onPointerMove = (e: PointerEvent) => {
      if (lpStart === null) return;
      if (Math.abs(e.clientX - lpStart.x) > 10 || Math.abs(e.clientY - lpStart.y) > 10)
        cancelLongPress();
    };
    const onClickCapture = (e: MouseEvent) => {
      // Klik na „−" na kartici — sakrij granu, ne otvaraj detalje.
      const hideBtn = (e.target as HTMLElement | null)?.closest<HTMLElement>('.ft-card-hide');
      if (hideBtn) {
        e.preventDefault();
        e.stopPropagation();
        swallowClick = false;
        const id = personIdAt(hideBtn);
        if (id !== null) hideRef.current?.(id);
        return;
      }
      if (!swallowClick) return;
      swallowClick = false;
      e.preventDefault();
      e.stopPropagation();
    };
    cont.addEventListener('pointerdown', onPointerDown, true);
    cont.addEventListener('pointermove', onPointerMove, true);
    cont.addEventListener('pointerup', cancelLongPress, true);
    cont.addEventListener('pointercancel', cancelLongPress, true);
    cont.addEventListener('click', onClickCapture, true);

    return () => {
      cont.removeEventListener('dblclick', onDblClick, true);
      cont.removeEventListener('contextmenu', onContextMenu, true);
      cont.removeEventListener('pointerdown', onPointerDown, true);
      cont.removeEventListener('pointermove', onPointerMove, true);
      cont.removeEventListener('pointerup', cancelLongPress, true);
      cont.removeEventListener('pointercancel', cancelLongPress, true);
      cont.removeEventListener('click', onClickCapture, true);
      cancelLongPress();
      chartRef.current = null;
      cont.innerHTML = '';
    };
  }, []);

  // Ažuriranje podataka
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || f3Data.length === 0) return;
    chart.updateData(f3Data as unknown as F3Data);
    if (firstRenderRef.current) {
      firstRenderRef.current = false;
      // Ako je fokus zadat od starta, odmah centriraj tu osobu.
      if (focusId !== null && f3Data.some((d) => d.id === String(focusId))) {
        lastFocusRef.current = focusId;
        chart.updateMainId(String(focusId));
        chart.updateTree({ initial: true, tree_position: 'main_to_middle' });
      } else {
        chart.updateTree({ initial: true, tree_position: 'fit' });
      }
    } else {
      chart.updateTree({ tree_position: 'inherit' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [f3Data]);

  // Promena fokusa (?focus=)
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || f3Data.length === 0) return;
    // Fokus očišćen (npr. „Cela porodica" / „Nazad" do dna) → vrati pogled kao posle
    // refresh-a: koren na podrazumevani prvi čvor (family-chart default), pa uklopi celo stablo.
    if (focusId === null) {
      if (lastFocusRef.current !== null) {
        lastFocusRef.current = null;
        const defaultMainId = f3Data[0]?.id;
        if (defaultMainId !== undefined) chart.updateMainId(defaultMainId);
        chart.updateTree({ tree_position: 'fit' });
      }
      return;
    }
    if (focusId === lastFocusRef.current) return;
    if (!f3Data.some((d) => d.id === String(focusId))) return;
    lastFocusRef.current = focusId;
    chart.updateMainId(String(focusId));
    chart.updateTree({ tree_position: 'main_to_middle' });
  }, [focusId, f3Data]);

  // Promena dubine — re-trim oko trenutne glavne osobe bez pomeranja pogleda.
  // Prvi render drži efekat podataka; ovde reagujemo samo na naknadne izmene.
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart || f3Data.length === 0 || firstRenderRef.current) return;
    applyDepth(chart);
    chart.updateTree({ tree_position: 'inherit' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progenyDepth, f3Data]);

  // Izbor (kalkulator srodstva) menja samo isticanje, bez re-rendera stabla —
  // pa direktno prebacujemo klasu na postojećim karticama u DOM-u. progenyDepth je u
  // deps: kartica koju otkrije veća dubina mora ponovo dobiti klasu izbora.
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const sel = new Set(selectedIds.map(String));
    cont.querySelectorAll<HTMLElement>('.ft-card').forEach((el) => {
      el.classList.toggle('ft-card-selected', sel.has(el.dataset.personId ?? ''));
    });
  }, [selectedIds, f3Data, progenyDepth]);

  // „−" se ne prikazuje na glavnoj osobi i precima — kao i izbor, prebacivanjem
  // klase u DOM-u (bez re-rendera kartica). focusId je u deps: re-root menja skup.
  useEffect(() => {
    const cont = contRef.current;
    if (!cont) return;
    const prot = new Set(protectedIds.map(String));
    cont.querySelectorAll<HTMLElement>('.ft-card').forEach((el) => {
      el.classList.toggle('ft-card-no-hide', prot.has(el.dataset.personId ?? ''));
    });
  }, [protectedIds, f3Data, progenyDepth, focusId]);

  return <div ref={contRef} className="f3 ft-tree" data-testid="tree-canvas" />;
}
