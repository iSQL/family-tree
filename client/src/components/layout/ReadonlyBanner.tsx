import { Link } from 'react-router-dom';
import { Eye } from 'lucide-react';
import { useReadonly } from '../../hooks/useAccess';
import { useSession } from '../../hooks/useSession';
import { STR } from '../../lib/strings';

/** Traka koja označava režim samo za pregled (read-only nalog ili javno čitanje bez prijave). */
export function ReadonlyBanner() {
  const readonly = useReadonly();
  const { data } = useSession();
  if (!readonly) return null;

  // Neprijavljeni gost (javno čitanje) može da se prijavi punom lozinkom za izmene.
  const anonymous = data ? !data.authenticated && data.auth_mode !== 'disabled' : false;

  return (
    <div className="zb-label flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 bg-activebg px-3 py-1.5 text-center text-xs text-activefg">
      <span className="flex items-center gap-2">
        <Eye size={16} aria-hidden="true" />
        {STR.readonly.banner}
      </span>
      {anonymous && (
        <Link to="/login" className="underline underline-offset-2 hover:opacity-80">
          {STR.readonly.loginToEdit}
        </Link>
      )}
    </div>
  );
}
