import { NavLink, Outlet } from 'react-router-dom';
import {
  Cake,
  FileText,
  HeartHandshake,
  History,
  Settings,
  TreeDeciduous,
  type LucideIcon,
} from 'lucide-react';
import { OfflineBanner } from './OfflineBanner';
import { ReadonlyBanner } from './ReadonlyBanner';
import { SearchBar } from '../search/SearchBar';
import { STR } from '../../lib/strings';

interface NavItem {
  to: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { to: '/', label: STR.nav.tree, icon: TreeDeciduous },
  { to: '/birthdays', label: STR.nav.birthdays, icon: Cake },
  { to: '/timeline', label: STR.nav.timeline, icon: History },
  { to: '/calculator', label: STR.nav.kinship, icon: HeartHandshake },
  { to: '/gedcom', label: STR.nav.gedcom, icon: FileText },
  { to: '/settings', label: STR.nav.settings, icon: Settings },
];

function desktopLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
    isActive
      ? 'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300'
      : 'text-stone-600 hover:bg-stone-200/70 dark:text-stone-300 dark:hover:bg-stone-800'
  }`;
}

function mobileLinkClass({ isActive }: { isActive: boolean }): string {
  return `flex min-w-0 flex-1 flex-col items-center gap-0.5 py-2 text-[10px] font-medium ${
    isActive ? 'text-amber-700 dark:text-amber-400' : 'text-stone-500 dark:text-stone-400'
  }`;
}

/** Ljuska: desktop top bar, mobilni bottom tabovi (<768px), offline traka. */
export function AppShell() {
  return (
    <div className="flex h-dvh flex-col pt-[env(safe-area-inset-top)]">
      <OfflineBanner />
      <ReadonlyBanner />

      {/* Desktop top bar */}
      <header className="hidden items-center gap-4 border-b border-stone-200 bg-white px-4 py-2 md:flex dark:border-stone-700 dark:bg-stone-900">
        <NavLink to="/" className="flex items-center gap-2 text-base font-bold text-amber-800 dark:text-amber-400">
          <TreeDeciduous size={22} aria-hidden="true" />
          {STR.appName}
        </NavLink>
        <div className="max-w-xs flex-1">
          <SearchBar />
        </div>
        <nav className="ml-auto flex items-center gap-1">
          {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
            <NavLink key={to} to={to} end={to === '/'} className={desktopLinkClass}>
              <Icon size={16} aria-hidden="true" />
              {label}
            </NavLink>
          ))}
        </nav>
      </header>

      {/* Mobilni top bar: naslov + pretraga */}
      <header className="flex items-center gap-3 border-b border-stone-200 bg-white px-3 py-2 md:hidden dark:border-stone-700 dark:bg-stone-900">
        <NavLink to="/" className="shrink-0 text-amber-800 dark:text-amber-400" aria-label={STR.appName}>
          <TreeDeciduous size={24} aria-hidden="true" />
        </NavLink>
        <div className="flex-1">
          <SearchBar />
        </div>
      </header>

      <main className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </main>

      {/* Mobilni bottom tabovi */}
      <nav className="flex border-t border-stone-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden dark:border-stone-700 dark:bg-stone-900">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink key={to} to={to} end={to === '/'} className={mobileLinkClass}>
            <Icon size={20} aria-hidden="true" />
            <span className="max-w-full truncate px-0.5">{label}</span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
