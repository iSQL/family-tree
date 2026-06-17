import { ArrowLeft, Maximize2, Minus, Plus } from 'lucide-react';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

export type DepthAxis = 'ancestry' | 'progeny';

export interface TreeControlsProps {
  /** Ima li prethodnih fokusa za vraćanje. */
  canGoBack: boolean;
  /** Da li je prikaz ograničen (fokus ili dubina) — uslovljava dugme „Cela porodica". */
  isBounded: boolean;
  /** Trenutna dubina prikaza po osi; undefined = neograničeno („sve"). */
  ancestry: number | undefined;
  progeny: number | undefined;
  onBack: () => void;
  onReset: () => void;
  onChangeDepth: (axis: DepthAxis, delta: number) => void;
}

/** Jedna osa stepera dubine: [−] vrednost-ili-„sve" [+]. */
function DepthStepper({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number | undefined;
  onChange: (delta: number) => void;
}) {
  const unbounded = value === undefined;
  return (
    <div className="flex items-center gap-1 rounded-lg bg-white/90 px-2 py-1 shadow-lg dark:bg-stone-800/90">
      <span className="text-xs font-medium text-stone-600 dark:text-stone-300">{label}</span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(-1)}
        disabled={value === 0}
        aria-label={STR.tree.depthLess}
      >
        <Minus size={14} aria-hidden="true" />
      </Button>
      <span className="min-w-[1.75rem] text-center text-sm tabular-nums" aria-live="polite">
        {unbounded ? STR.tree.depthAll : value}
      </span>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(1)}
        disabled={unbounded}
        aria-label={STR.tree.depthMore}
      >
        <Plus size={14} aria-hidden="true" />
      </Button>
    </div>
  );
}

/** Plutajuće kontrole stabla (gore-levo): vraćanje pregleda + dubina prikaza. */
export function TreeControls({
  canGoBack,
  isBounded,
  ancestry,
  progeny,
  onBack,
  onReset,
  onChangeDepth,
}: TreeControlsProps) {
  return (
    <div className="absolute top-3 left-3 z-10 flex flex-col items-start gap-2">
      {(canGoBack || isBounded) && (
        <div className="flex gap-2">
          {canGoBack && (
            <Button variant="secondary" size="sm" className="shadow-lg" onClick={onBack}>
              <ArrowLeft size={16} aria-hidden="true" />
              {STR.tree.back}
            </Button>
          )}
          {isBounded && (
            <Button variant="secondary" size="sm" className="shadow-lg" onClick={onReset}>
              <Maximize2 size={16} aria-hidden="true" />
              {STR.tree.wholeFamily}
            </Button>
          )}
        </div>
      )}
      <div className="flex gap-2">
        <DepthStepper
          label={STR.tree.ancestors}
          value={ancestry}
          onChange={(d) => onChangeDepth('ancestry', d)}
        />
        <DepthStepper
          label={STR.tree.descendants}
          value={progeny}
          onChange={(d) => onChangeDepth('progeny', d)}
        />
      </div>
    </div>
  );
}
