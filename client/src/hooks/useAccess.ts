import { useOnline } from './useOnline';
import { useSession } from './useSession';

/**
 * true kad korisnik sme samo da gleda: prijavljen read-only lozinkom ILI neprijavljeni
 * gost dok je uključeno javno čitanje (PUBLIC_READ). Dev režim (auth_mode 'disabled')
 * je uvek pun pristup.
 */
export function useReadonly(): boolean {
  const { data } = useSession();
  if (!data) return false;
  if (data.auth_mode === 'disabled') return false;
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
