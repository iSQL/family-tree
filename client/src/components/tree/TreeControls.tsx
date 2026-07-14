import { ArrowLeft, Users, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

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
}: TreeControlsProps) {
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
    </div>
  );
}
