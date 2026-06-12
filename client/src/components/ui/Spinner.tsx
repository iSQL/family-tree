import { STR } from '../../lib/strings';

export function Spinner({ size = 24 }: { size?: number }) {
  return (
    <span
      role="status"
      aria-label={STR.common.loading}
      className="inline-block animate-spin rounded-full border-2 border-stone-300 border-t-amber-700 dark:border-stone-600 dark:border-t-amber-500"
      style={{ width: size, height: size }}
    />
  );
}

/** Centriran spiner koji ispunjava raspoloživi prostor. */
export function FullScreenSpinner() {
  return (
    <div className="flex h-full min-h-40 flex-1 items-center justify-center py-16">
      <Spinner size={32} />
    </div>
  );
}
