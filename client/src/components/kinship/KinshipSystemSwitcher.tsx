import { useKinshipSystem } from '../../lib/kinshipSystem';
import { STR } from '../../lib/strings';

export interface KinshipSystemSwitcherProps {
  variant?: 'compact' | 'standard';
  showLabel?: boolean;
  className?: string;
}

/**
 * Prebacivač za izbor sistema računanja srodstva: Građansko (Rimsko) vs Crkveno (Kanonsko).
 */
export function KinshipSystemSwitcher({
  variant = 'standard',
  showLabel = true,
  className = '',
}: KinshipSystemSwitcherProps) {
  const { kinshipSystem, setKinshipSystem } = useKinshipSystem();
  const isCompact = variant === 'compact';

  return (
    <div className={`flex flex-wrap items-center gap-2 ${className}`}>
      {showLabel && (
        <span className="zb-label text-[11px] tracking-[.14em] text-faint select-none">
          {STR.kinship.systemLabel}:
        </span>
      )}
      <div className="inline-flex rounded-lg border border-line bg-surface p-0.5 select-none">
        <button
          type="button"
          onClick={() => setKinshipSystem('civil')}
          aria-pressed={kinshipSystem === 'civil'}
          className={`cursor-pointer rounded-md font-medium transition-colors ${
            isCompact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs'
          } ${
            kinshipSystem === 'civil'
              ? 'bg-navy text-onnav shadow-sm dark:bg-activebg dark:text-activefg'
              : 'text-muted hover:text-ink'
          }`}
          title={STR.kinship.systemCivilDesc}
        >
          {isCompact ? STR.kinship.systemCivilShort : STR.kinship.systemCivil}
        </button>
        <button
          type="button"
          onClick={() => setKinshipSystem('canon')}
          aria-pressed={kinshipSystem === 'canon'}
          className={`cursor-pointer rounded-md font-medium transition-colors ${
            isCompact ? 'px-2.5 py-1 text-[11px]' : 'px-3 py-1 text-xs'
          } ${
            kinshipSystem === 'canon'
              ? 'bg-navy text-onnav shadow-sm dark:bg-activebg dark:text-activefg'
              : 'text-muted hover:text-ink'
          }`}
          title={STR.kinship.systemCanonDesc}
        >
          {isCompact ? STR.kinship.systemCanonShort : STR.kinship.systemCanon}
        </button>
      </div>
    </div>
  );
}

