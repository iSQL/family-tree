import { Eye } from 'lucide-react';
import { useReadonly } from '../../hooks/useAccess';
import { STR } from '../../lib/strings';

/** Traka koja označava da je sesija u režimu samo za pregled. */
export function ReadonlyBanner() {
  const readonly = useReadonly();
  if (!readonly) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-amber-200 px-3 py-1.5 text-center text-sm font-medium text-amber-950">
      <Eye size={16} aria-hidden="true" />
      {STR.readonly.banner}
    </div>
  );
}
