import type { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useBranch } from '../../hooks/useAccess';

/** Stranice koje rade samo nad glavnim stablom (GEDCOM, kopije, pregled predloga) — u režimu predloga vode na stablo. */
export function MainTreeOnly({ children }: { children: ReactNode }) {
  return useBranch() ? <Navigate to="/" replace /> : <>{children}</>;
}
