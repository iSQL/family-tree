import { ArrowLeft, Eye, EyeOff, Users, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

export interface HiddenBranchSummary {
  rootId: number;
  label: string;
  /** Ukupan broj skrivenih osoba u grani (uključuje i koren). */
  count: number;
}

export interface TreeControlsProps {
  /** Ima li prethodnih fokusa za vraćanje. */
  canGoBack: boolean;
  /** Da li je stablo fokusirano na jednu osobu — uslovljava dugme „Cela porodica". */
  hasFocus: boolean;
  /** Trenutni broj prikazanih generacija potomaka. */
  progeny: number;
  /** Najveći mogući broj generacija potomaka za glavnu osobu (kapa za „+"). */
  maxProgeny: number;
  onBack: () => void;
  onReset: () => void;
  onChangeProgeny: (delta: number) => void;
  /** Skrivene grane (kontekst meni / „−" na kartici). */
  hiddenBranches: HiddenBranchSummary[];
  onRestoreBranch: (rootId: number) => void;
  onShowAll: () => void;
}

/** Plutajuće kontrole stabla (gore-levo): vraćanje pregleda + broj generacija potomaka. */
export function TreeControls({
  canGoBack,
  hasFocus,
  progeny,
  maxProgeny,
  onBack,
  onReset,
  onChangeProgeny,
  hiddenBranches,
  onRestoreBranch,
  onShowAll,
}: TreeControlsProps) {
  const hiddenTotal = hiddenBranches.reduce((n, b) => n + b.count, 0);

  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
      {(canGoBack || hasFocus) && (
        <div className="flex gap-2">
          {canGoBack && (
            <Button variant="secondary" size="sm" className="shadow-lg" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              {STR.tree.back}
            </Button>
          )}
          {hasFocus && (
            <Button variant="secondary" size="sm" className="shadow-lg" onClick={onReset}>
              <Users size={16} aria-hidden="true" />
              {STR.tree.families}
            </Button>
          )}
        </div>
      )}

      {/* Stepper potomaka — sakriven kad glavna osoba nema potomaka (nema šta da se filtrira). */}
      {maxProgeny > 0 && (
        <div className="flex items-center gap-1 rounded-[9px] border border-line bg-surface/95 px-2 py-1 shadow-[0_6px_18px_-6px_rgba(20,30,50,.4)]">
          <span className="zb-label text-[11px] text-muted">
            {STR.tree.descendants}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChangeProgeny(-1)}
            disabled={progeny <= 0}
            aria-label={STR.tree.depthLess}
          >
            <Minus size={14} aria-hidden="true" />
          </Button>
          <span className="min-w-[2.5rem] text-center text-sm tabular-nums" aria-live="polite">
            {progeny}/{maxProgeny}
          </span>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => onChangeProgeny(1)}
            disabled={progeny >= maxProgeny}
            aria-label={STR.tree.depthMore}
          >
            <Plus size={14} aria-hidden="true" />
          </Button>
        </div>
      )}

      {/* Skrivene grane — vidljivo samo dok ih ima; čip vraća pojedinačnu granu,
          „Prikaži sve" sve odjednom. */}
      {hiddenBranches.length > 0 && (
        <div className="flex max-w-[300px] flex-col gap-1.5 rounded-[9px] border border-line bg-surface/95 px-2.5 py-2 shadow-[0_6px_18px_-6px_rgba(20,30,50,.4)]">
          <div className="flex items-center gap-2">
            <EyeOff size={14} className="shrink-0 text-muted" aria-hidden="true" />
            <span className="zb-label text-[11px] text-muted">
              {STR.tree.hiddenCount} {hiddenTotal}
            </span>
            <Button variant="secondary" size="sm" className="ml-auto" onClick={onShowAll}>
              {STR.tree.showAll}
            </Button>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {hiddenBranches.map((b) => (
              <button
                key={b.rootId}
                type="button"
                title={STR.tree.restoreBranch}
                onClick={() => onRestoreBranch(b.rootId)}
                className="flex items-center gap-1.5 rounded-full border border-dashed border-line bg-bg py-0.5 pr-2.5 pl-2 text-xs text-muted transition-colors hover:border-gold hover:text-ink"
              >
                <Eye size={13} aria-hidden="true" />
                {b.label}
                {b.count > 1 && <span className="text-faint">+{b.count - 1}</span>}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
