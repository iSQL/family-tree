import type { BranchSessionInfo } from '@shared/types';
import { useOnline } from './useOnline';
import { useSession } from './useSession';

/** Režim predloga (pozivni link): sve izmene idu u granu linka, administrator ih spaja. */
export function useBranch(): BranchSessionInfo | null {
  const { data } = useSession();
  return data?.branch ?? null;
}

/**
 * true kad korisnik sme samo da gleda: prijavljen read-only lozinkom ILI neprijavljeni
 * gost dok je uključeno javno čitanje (PUBLIC_READ). Dev režim (auth_mode 'disabled')
 * i režim predloga su uvek pun pristup (u predlogu — nad granom).
 */
export function useReadonly(): boolean {
  const { data } = useSession();
  if (!data) return false;
  if (data.auth_mode === 'disabled' || data.branch) return false;
  return data.readonly || !data.authenticated;
}

/**
 * Da li korisnik sme da menja podatke. False kad je offline ILI u režimu samo za pregled.
 * Server svejedno odbija mutacije za read-only sesije — ovo je samo za skrivanje UI-ja.
 */
export function useCanWrite(): boolean {
  const online = useOnline();
  const readonly = useReadonly();
  return online && !readonly;
}

/** Pun pristup nad GLAVNIM stablom (pozivni linkovi, pregled predloga) — ne u režimu predloga. */
export function useCanAdminister(): boolean {
  const canWrite = useCanWrite();
  const branch = useBranch();
  return canWrite && branch === null;
}
