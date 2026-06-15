import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useSession } from '../../hooks/useSession';
import { FullScreenSpinner } from '../ui/Spinner';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

/** Pušta decu tek kad sesija kaže authenticated (ili je auth isključen u dev modu). */
export function AuthGuard({ children }: { children: ReactNode }) {
  const { data, isPending, isError, refetch } = useSession();

  if (isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <FullScreenSpinner />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex h-dvh flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.session.checkFailed}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  if (data.auth_mode === 'disabled' || data.authenticated || data.public_read) {
    return <>{children}</>;
  }

  return <Navigate to="/login" replace />;
}
