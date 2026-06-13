import { useOnline } from './useOnline';
import { useSession } from './useSession';

/** true kad je sesija prijavljena read-only lozinkom (samo pregled). */
export function useReadonly(): boolean {
  const { data } = useSession();
  return data?.readonly ?? false;
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
