import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeftRight, Calculator, X } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import { describeKinships, type KinshipResult } from '@shared/kinship';
import { Avatar } from '../person/Avatar';
import { KinshipResults } from '../kinship/KinshipResults';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

function safeKinships(tree: TreeResponse, fromId: number, toId: number): KinshipResult[] | 'error' {
  try {
    return describeKinships(tree, fromId, toId);
  } catch {
    return 'error';
  }
}

export interface KinshipPanelProps {
  tree: TreeResponse;
  /** Trenutno izabrane osobe (0–2). */
  selectedIds: number[];
  /** Ukloni jednu osobu iz izbora. */
  onRemove: (id: number) => void;
  /** Zameni levu i desnu izabranu osobu. */
  onSwap: () => void;
  /** Očisti ceo izbor. */
  onClear: () => void;
  /** Zatvori mod „Srodstvo". */
  onExit: () => void;
}

/** Plutajući panel (dno) za kalkulator srodstva pokrenut izborom čvorova u stablu. */
export function KinshipPanel({ tree, selectedIds, onRemove, onSwap, onClear, onExit }: KinshipPanelProps) {
  const navigate = useNavigate();
  const byId = useMemo(() => new Map(tree.persons.map((p) => [p.id, p])), [tree]);

  const [aId, bId] = selectedIds;
  const results = useMemo(() => {
    if (aId === undefined || bId === undefined || aId === bId) return null;
    return safeKinships(tree, aId, bId);
  }, [tree, aId, bId]);

  return (
    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-20 flex justify-center p-3">
      <div className="pointer-events-auto flex max-h-[60vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(20,30,50,.55)]">
        {/* Zaglavlje */}
        <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
          <h2 className="zb-label text-[11px] tracking-[.22em] text-goldd">{STR.kinship.title}</h2>
          <button
            type="button"
            aria-label={STR.common.close}
            onClick={onExit}
            className="cursor-pointer rounded-md p-1.5 text-faint hover:bg-surface2 hover:text-ink"
          >
            <X size={18} />
          </button>
        </div>

        <div className="space-y-3 overflow-y-auto p-4">
          {/* Izabrane osobe */}
          <div className="flex flex-wrap items-center gap-1.5">
            {selectedIds.map((id, i) => {
              const p = byId.get(id);
              if (!p) return null;
              return (
                <span key={id} className="flex items-center gap-1.5">
                  {i > 0 && (
                    <button
                      type="button"
                      aria-label={STR.kinship.swap}
                      title={STR.kinship.swap}
                      onClick={onSwap}
                      className="cursor-pointer rounded-full p-1.5 text-faint hover:bg-surface2 hover:text-ink"
                    >
                      <ArrowLeftRight size={16} />
                    </button>
                  )}
                  <span className="flex items-center gap-1.5 rounded-full border border-line bg-bg py-1 pr-1 pl-1 text-sm text-ink">
                    <Avatar person={p} size={24} />
                    <span className="truncate pl-0.5">
                      {p.first_name} {p.last_name}
                    </span>
                    <button
                      type="button"
                      aria-label={STR.common.delete}
                      onClick={() => onRemove(id)}
                      className="cursor-pointer rounded-full p-1 hover:bg-surface2"
                    >
                      <X size={14} />
                    </button>
                  </span>
                </span>
              );
            })}
          </div>

          {/* Stanje / rezultat */}
          {selectedIds.length === 0 ? (
            <p className="text-sm text-muted">{STR.kinship.selectFirst}</p>
          ) : selectedIds.length === 1 ? (
            <p className="text-sm text-muted">{STR.kinship.selectSecond}</p>
          ) : aId === bId ? (
            <p className="text-sm text-muted">{STR.kinship.samePerson}</p>
          ) : results === 'error' || results === null ? (
            <p className="text-sm text-danger">{STR.kinship.error}</p>
          ) : (
            <KinshipResults
              results={results}
              tree={tree}
              onPathClick={(id) => navigate(`/?focus=${id}`)}
              onShowConnection={(line) => navigate(`/connection?a=${aId}&b=${bId}&line=${line}`)}
            />
          )}

          {/* Akcije */}
          <div className="flex flex-wrap gap-2 pt-1">
            {results !== null && results !== 'error' && aId !== bId && (
              <Button size="sm" variant="secondary" onClick={() => navigate(`/calculator?a=${aId}&b=${bId}`)}>
                <Calculator size={14} aria-hidden="true" />
                {STR.kinship.openCalculator}
              </Button>
            )}
            {selectedIds.length > 0 && (
              <Button size="sm" variant="ghost" onClick={onClear}>
                {STR.kinship.clear}
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
