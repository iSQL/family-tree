import { ArrowLeft, Maximize2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

export interface TreeControlsProps {
  /** Ima li prethodnih fokusa za vraćanje. */
  canGoBack: boolean;
  /** Da li je stablo trenutno fokusirano na jednu osobu. */
  hasFocus: boolean;
  onBack: () => void;
  onReset: () => void;
}

/** Plutajuće kontrole stabla (gore-levo): vrati prethodni pregled / cela porodica. */
export function TreeControls({ canGoBack, hasFocus, onBack, onReset }: TreeControlsProps) {
  if (!canGoBack && !hasFocus) return null;
  return (
    <div className="absolute top-3 left-3 z-10 flex gap-2">
      {canGoBack && (
        <Button variant="secondary" size="sm" className="shadow-lg" onClick={onBack}>
          <ArrowLeft size={16} aria-hidden="true" />
          {STR.tree.back}
        </Button>
      )}
      {hasFocus && (
        <Button variant="secondary" size="sm" className="shadow-lg" onClick={onReset}>
          <Maximize2 size={16} aria-hidden="true" />
          {STR.tree.wholeFamily}
        </Button>
      )}
    </div>
  );
}
