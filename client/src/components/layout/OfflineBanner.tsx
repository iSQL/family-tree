import { WifiOff } from 'lucide-react';
import { useOnline } from '../../hooks/useOnline';
import { STR } from '../../lib/strings';

export function OfflineBanner() {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="zb-label flex items-center justify-center gap-2 bg-gold px-3 py-1.5 text-center text-xs text-ongold">
      <WifiOff size={16} aria-hidden="true" />
      {STR.offline.banner}
    </div>
  );
}
