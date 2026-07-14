/**
 * List postera — jedan „papir" sa naslovom, stablom, legendom, okvirom i vodenim
 * žigom. Renderuje se u logičkim px i koristi ga i pregled na ekranu i štampa
 * (štampa ga samo skalira na fizičke mm). Uvek svetla tema (papir).
 */
import type { Gender } from '@shared/types';
import { CARD_H, CARD_W, type PosterLayout } from '../../lib/posterLayout';
import { formatLifespan } from '../../lib/dates';
import { STR } from '../../lib/strings';

export interface PosterContent {
  photos: boolean;
  years: boolean;
  title: boolean;
  birthplace: boolean;
  genderColors: boolean;
}

export interface PosterExtras {
  title: boolean;
  subtitle: boolean;
  legend: boolean;
  frame: boolean;
  watermark: boolean;
}

export interface PosterSheetProps {
  layout: PosterLayout;
  mainId: number;
  content: PosterContent;
  extras: PosterExtras;
  posterTitle: string;
  /** Dimenzije lista u px (odnos = odnos papira). */
  width: number;
  height: number;
  /** Isprekidane vođice za sečenje (režim „Više A4"). */
  tilingGuides?: boolean;
  /** Istaknute osobe (tirkizni okvir) — izbor čvorova / veza srodstva. */
  highlightIds?: readonly number[];
  /** Naziv stavke legende za istaknute osobe; bez nje se stavka ne prikazuje. */
  highlightLegend?: string | null;
  /** Klik na karticu (režim izbora čvorova u pregledu). */
  onCardClick?: (id: number) => void;
}

const GENDER_HEX: Record<Gender, string> = { M: '#294d75', F: '#b0862f', U: '#8a7c6a' };
const NEUTRAL = '#8a7c6a';
/** Brend boje (zabari.net) — poster je uvek svetao papir. */
const NAVY = '#1d3557';
const GOLD = '#c29b47';
const GOLD_DARK = '#b89040';
const INK = '#2b2b2b';
const MUTED = '#6e6558';
const FAINT = '#9a8e7e';

/** Unutrašnja margina lista i visine zaglavlja/legende u px. */
const PAD = 30;
const HEADER_H = 74;
const LEGEND_H = 46;
/** Kartice se ne uvećavaju preko ovoga ni kad je stablo sitno. */
const MAX_SCALE = 1.25;

function todayLabel(): string {
  const d = new Date();
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  return `${dd}.${mm}.${d.getFullYear()}.`;
}

function Silhouette({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 44 44" width={40} height={40} style={{ color, display: 'block' }} aria-hidden="true">
      <circle cx="22" cy="17" r="7" fill="currentColor" />
      <path d="M8 40c1.5-9 7.5-13 14-13s12.5 4 14 13" fill="currentColor" />
    </svg>
  );
}

function LeafMark({ size, color }: { size: number; color: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M8 19a4 4 0 0 1-2.24-7.32A3.5 3.5 0 0 1 9 6.03V6a3 3 0 1 1 6 0v.03a3.5 3.5 0 0 1 3.24 5.65A4 4 0 0 1 16 19Z" />
      <path d="M12 19v3" />
    </svg>
  );
}

export function PosterSheet({
  layout,
  mainId,
  content,
  extras,
  posterTitle,
  width,
  height,
  tilingGuides = false,
  highlightIds,
  highlightLegend = null,
  onCardClick,
}: PosterSheetProps) {
  const highlighted = highlightIds !== undefined ? new Set(highlightIds) : null;
  const hasHeader = extras.title || extras.subtitle;
  const headerH = hasHeader ? HEADER_H : 8;
  const legendH = extras.legend ? LEGEND_H : 8;
  const treeW = width - 2 * PAD;
  const treeH = height - 2 * PAD - headerH - legendH;
  const scale = Math.min(treeW / layout.width, treeH / layout.height, MAX_SCALE);

  return (
    <div
      className="poster-sheet"
      style={{
        position: 'relative',
        width,
        height,
        background: '#ffffff',
        color: INK,
        display: 'flex',
        flexDirection: 'column',
        padding: PAD,
        boxSizing: 'border-box',
        flexShrink: 0,
        fontFamily: "'Cormorant Garamond', Georgia, 'Times New Roman', serif",
      }}
    >
      {extras.frame && (
        <>
          <div style={{ position: 'absolute', inset: 14, border: `2px solid ${GOLD}`, borderRadius: 3, pointerEvents: 'none' }} />
          <div style={{ position: 'absolute', inset: 19, border: '1px solid #e2d7c7', borderRadius: 2, pointerEvents: 'none' }} />
        </>
      )}

      {hasHeader && (
        <div style={{ textAlign: 'center', flexShrink: 0, height: headerH, paddingBottom: 6 }}>
          {extras.title && (
            <div style={{ fontFamily: "'Marcellus', Georgia, serif", fontSize: 27, fontWeight: 400, letterSpacing: 0.4, color: NAVY }}>{posterTitle}</div>
          )}
          {extras.subtitle && (
            <div style={{ fontFamily: "'Marcellus SC', Georgia, serif", fontSize: 10.5, letterSpacing: '0.14em', textTransform: 'uppercase' as const, color: GOLD_DARK, marginTop: 5 }}>
              {STR.poster.subtitlePrefix} {todayLabel()} · {layout.nodes.length} {STR.poster.personsWord}
            </div>
          )}
          <div style={{ width: 56, height: 3, background: GOLD, borderRadius: 2, margin: '10px auto 0' }} />
        </div>
      )}

      {/* Skala stabla ide preko CSS `zoom` (menja LAYOUT, ne samo prikaz) — transform:scale
          bi ostavio layout kutije šire od stranice, pa Chrome pri štampi „Više A4" sam
          skuplja sadržaj (fit-to-page, do 2/3). Sa zoom-om sve kutije ostaju unutar lista. */}
      <div
        style={{
          position: 'relative',
          flex: 1,
          minHeight: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            position: 'relative',
            width: layout.width,
            height: layout.height,
            zoom: scale,
            flexShrink: 0,
          }}
        >
          <svg
            viewBox={`0 0 ${layout.width} ${layout.height}`}
            width={layout.width}
            height={layout.height}
            style={{ position: 'absolute', top: 0, left: 0, overflow: 'visible' }}
            aria-hidden="true"
          >
            {layout.lines.map((ln, i) => (
              <polyline
                key={i}
                points={ln.points}
                fill="none"
                stroke={ln.main ? GOLD_DARK : '#dac9b2'}
                strokeWidth={2.5}
                strokeLinejoin="round"
              />
            ))}
          </svg>
          {layout.nodes.map(({ person: p, x, y }) => {
            const hex = content.genderColors ? GENDER_HEX[p.gender] : NEUTRAL;
            const isMain = p.id === mainId;
            const isHighlighted = highlighted?.has(p.id) ?? false;
            const years = content.years ? formatLifespan(p.birth_date, p.death_date) : '';
            const place = content.birthplace ? (p.birth_place ?? '') : '';
            // Isticanje izbora/veze pobeđuje nad okvirom glavne osobe (kao u stablu).
            const ring = isHighlighted
              ? { outline: `3px solid ${NAVY}`, outlineOffset: 1, boxShadow: '0 1px 3px rgba(20,30,50,0.16), 0 0 0 5px rgba(29,53,87,0.16)' }
              : isMain
                ? { outline: `3px solid ${GOLD}`, outlineOffset: 1 }
                : null;
            return (
              <div
                key={p.id}
                {...(onCardClick !== undefined
                  ? {
                      onClick: () => onCardClick(p.id),
                      role: 'button' as const,
                      tabIndex: 0,
                      onKeyDown: (e: React.KeyboardEvent) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          onCardClick(p.id);
                        }
                      },
                    }
                  : null)}
                style={{
                  cursor: onCardClick !== undefined ? 'pointer' : undefined,
                  position: 'absolute',
                  left: x,
                  top: y,
                  width: CARD_W,
                  height: CARD_H,
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  padding: '8px 10px',
                  borderRadius: 10,
                  background: '#ffffff',
                  boxShadow: '0 1px 3px rgba(20,30,50,0.16)',
                  borderLeft: `5px solid ${hex}`,
                  overflow: 'hidden',
                  boxSizing: 'border-box',
                  ...ring,
                }}
              >
                {content.photos && (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      flex: '0 0 auto',
                      borderRadius: 9999,
                      overflow: 'hidden',
                      background: `color-mix(in srgb, ${hex} 15%, #ffffff)`,
                    }}
                  >
                    {p.photo_id ? (
                      <img
                        src={`/api/photos/${encodeURIComponent(p.photo_id)}?size=thumb`}
                        alt=""
                        width={40}
                        height={40}
                        style={{ width: 40, height: 40, objectFit: 'cover', display: 'block' }}
                      />
                    ) : (
                      <Silhouette color={hex} />
                    )}
                  </div>
                )}
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div
                    style={{
                      fontSize: 13,
                      fontWeight: 600,
                      lineHeight: 1.2,
                      color: INK,
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {`${p.first_name} ${p.last_name}`.trim() || '?'}
                    {content.title && p.title && (
                      <span style={{ fontSize: 10, fontWeight: 400, color: MUTED }}> {p.title}</span>
                    )}
                  </div>
                  {years && <div style={{ fontSize: 11, color: MUTED, marginTop: 1 }}>{years}</div>}
                  {place && (
                    <div
                      style={{
                        fontSize: 10,
                        color: FAINT,
                        marginTop: 1,
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                      }}
                    >
                      {place}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {tilingGuides && (
          <svg
            style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }}
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden="true"
          >
            <line x1="50" y1="0" x2="50" y2="100" stroke={NAVY} strokeWidth="0.35" strokeDasharray="2 1.4" />
            <line x1="0" y1="50" x2="100" y2="50" stroke={NAVY} strokeWidth="0.35" strokeDasharray="2 1.4" />
          </svg>
        )}
      </div>

      {extras.legend && (
        <div
          style={{
            flexShrink: 0,
            height: legendH,
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'flex-end',
            gap: 18,
            flexWrap: 'wrap',
            paddingTop: 8,
            borderTop: '1px solid #e2d7c7',
          }}
        >
          {[
            { color: GENDER_HEX.M, label: STR.poster.legendMale, ring: false },
            { color: GENDER_HEX.F, label: STR.poster.legendFemale, ring: false },
            { color: GOLD, label: STR.poster.legendMain, ring: true },
            ...(highlightLegend !== null ? [{ color: NAVY, label: highlightLegend, ring: true }] : []),
          ].map((it) => (
            <div key={it.label} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: MUTED }}>
              <span
                style={{
                  width: 14,
                  height: 14,
                  borderRadius: 3,
                  flexShrink: 0,
                  ...(it.ring
                    ? { background: '#ffffff', boxShadow: `0 0 0 2px ${it.color} inset` }
                    : { background: it.color }),
                }}
              />
              {it.label}
            </div>
          ))}
        </div>
      )}

      {extras.watermark && (
        <div
          style={{
            position: 'absolute',
            right: 24,
            bottom: 16,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
            color: '#c9bda6',
            fontFamily: "'Marcellus SC', Georgia, serif",
            fontSize: 10,
            letterSpacing: '0.08em',
          }}
        >
          <LeafMark size={13} color="#c9bda6" />
          {STR.appName} · {STR.brand.site}
        </div>
      )}
    </div>
  );
}
