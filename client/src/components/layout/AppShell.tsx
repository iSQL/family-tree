import { NavLink, Outlet, useSearchParams } from 'react-router-dom';
import {
  Cake,
  HeartHandshake,
  History,
  Settings,
  Users,
  type LucideIcon,
} from 'lucide-react';
import { OfflineBanner } from './OfflineBanner';
import { ReadonlyBanner } from './ReadonlyBanner';
import { SearchBar } from '../search/SearchBar';
import { STR } from '../../lib/strings';
import logoUrl from '../../assets/zabari-logo.svg';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: STR.nav.tree, icon: Users },
  { to: '/birthdays', label: STR.nav.birthdays, icon: Cake },
  { to: '/timeline', label: STR.nav.timeline, icon: History },
  { to: '/calculator', label: STR.nav.kinship, icon: HeartHandshake },
  { to: '/settings', label: STR.nav.settings, icon: Settings },
];

function desktopLinkClass({ isActive }: { isActive: boolean }): string {
  return `zb-label flex items-center gap-1.5 rounded-[9px] px-2.5 py-1.5 text-xs transition-colors ${
    isActive ? 'bg-activebg text-activefg' : 'text-muted hover:bg-surface2'
  }`;
}

function mobileLinkClass({ isActive }: { isActive: boolean }): string {
  return `zb-label flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] tracking-[.02em] ${
    isActive ? 'text-activefg' : 'text-faint'
  }`;
}

/** Rute koje se prikazuju u okviru porodice — nose tekući ?focus kroz navigaciju. */
const FAMILY_SCOPED = new Set(['/birthdays', '/timeline']);

/** Ljuska: desktop top bar, mobilni bottom tabovi (<768px), offline traka. */
export function AppShell() {
  const [searchParams] = useSearchParams();
  const focus = searchParams.get('focus');
  // Zadrži odabranu porodicu pri prelasku na Rođendane/Vremensku liniju.
  const navTo = (to: string) =>
    focus && FAMILY_SCOPED.has(to) ? { pathname: to, search: `?focus=${focus}` } : to;

  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <OfflineBanner />
      <ReadonlyBanner />

      {/* Desktop top bar */}
      <header className="hidden items-center gap-4 border-b border-line bg-surface px-4 py-2 md:flex">
        <NavLink to="/" className="flex items-center gap-2.5">
          <img src={logoUrl} alt="" width={30} height={30} className="rounded-full" aria-hidden="true" />
          <span className="font-display text-lg text-heading">{STR.appName}</span>
        </NavLink>
        <div className="max-w-xs flex-1">
          <SearchBar />
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={navTo(to)} end={to === '/'} className={desktopLinkClass}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Mobilni top bar: naslov + pretraga */}
      <header className="flex items-center gap-3 border-b border-line bg-surface px-3 py-2 md:hidden">
        <NavLink to="/" className="shrink-0" aria-label={STR.appName}>
          <img src={logoUrl} alt="" width={30} height={30} className="rounded-full" aria-hidden="true" />
        </NavLink>
        <div className="flex-1">
          <SearchBar />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>

      {/* Mobilni bottom tabovi */}
      <nav className="flex border-t border-line bg-surface pb-[env(safe-area-inset-bottom)] md:hidden">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={navTo(to)} end={to === '/'} className={mobileLinkClass}>
            <Icon size={20} aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
