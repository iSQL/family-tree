import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';
import { STR } from '../../lib/strings';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="flex items-center justify-center gap-2 bg-yellow-300 px-3 py-1.5 text-center text-sm font-medium text-yellow-950">
      <WifiOff size={16} aria-hidden="true" />
      {STR.offline.banner}
    </div>
  );
}
