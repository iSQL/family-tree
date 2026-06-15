import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, Download, FileText, LogIn, LogOut, Monitor, Moon, Sun, type LucideIcon } from 'lucide-react';
import { apiFetch } from '../api/client';
import { useInstallPrompt } from '../hooks/useInstallPrompt';
import { useOnline } from '../hooks/useOnline';
import { useReadonly } from '../hooks/useAccess';
import { useSession } from '../hooks/useSession';
import { useTree } from '../hooks/useTree';
import { useTheme, type Theme } from '../lib/theme';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { STR } from '../lib/strings';

const THEME_OPTIONS: { value: Theme; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: STR.settings.themeLight, icon: Sun },
  { value: 'dark', label: STR.settings.themeDark, icon: Moon },
  { value: 'system', label: STR.settings.themeSystem, icon: Monitor },
];

export default function SettingsPage() {
  const { theme, setTheme } = useTheme();
  const { canInstall, promptInstall } = useInstallPrompt();
  const { data: session } = useSession();
  const { data: tree } = useTree();
  const online = useOnline();
  const readonly = useReadonly();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const logout = useMutation({
    mutationFn: () => apiFetch('/api/auth/logout', { method: 'POST' }),
    onSuccess: () => {
      queryClient.clear();
      toast.success(STR.session.loggedOut);
      navigate('/login', { replace: true });
    },
    onError: (err: unknown) => {
      toast.error(err instanceof Error ? err.message : STR.errors.generic);
    },
  });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <h1 className="text-lg font-bold">{STR.settings.title}</h1>

        {/* Tema */}
        <Card>
          <CardHeader title={STR.settings.theme} />
          <div className="flex flex-wrap gap-2 p-4">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <Button
                key={value}
                variant={theme === value ? 'primary' : 'secondary'}
                size="sm"
                aria-pressed={theme === value}
                onClick={() => setTheme(value)}
              >
                <Icon size={14} aria-hidden="true" />
                {label}
              </Button>
            ))}
          </div>
        </Card>

        {/* Instalacija */}
        <Card>
          <CardHeader title={STR.settings.install} />
          <div className="space-y-3 p-4">
            <p className="text-sm text-stone-600 dark:text-stone-300">{STR.settings.installHint}</p>
            {canInstall ? (
              <Button onClick={() => void promptInstall()}>
                <Download size={16} aria-hidden="true" />
                {STR.settings.installButton}
              </Button>
            ) : (
              <p className="text-xs text-stone-400 dark:text-stone-500">{STR.settings.installUnavailable}</p>
            )}
            <details className="group rounded-lg border border-stone-200 dark:border-stone-700">
              <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium select-none">
                <ChevronRight
                  size={14}
                  aria-hidden="true"
                  className="shrink-0 transition-transform group-open:rotate-90"
                />
                {STR.settings.installIosTitle}
              </summary>
              <ol className="list-decimal space-y-1 px-3 pb-3 pl-9 text-sm text-stone-600 dark:text-stone-300">
                <li>{STR.settings.installIos1}</li>
                <li>{STR.settings.installIos2}</li>
                <li>{STR.settings.installIos3}</li>
              </ol>
            </details>
          </div>
        </Card>

        {/* Nalog */}
        <Card>
          <CardHeader title={STR.settings.account} />
          <div className="p-4">
            {session?.auth_mode === 'disabled' ? (
              <p className="text-sm text-stone-500 dark:text-stone-400">{STR.settings.authDisabledNote}</p>
            ) : !session?.authenticated ? (
              // Neprijavljeni gost u režimu javnog čitanja
              <div className="space-y-3">
                <p className="text-sm text-amber-700 dark:text-amber-400">{STR.settings.readonlyNote}</p>
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 dark:bg-amber-600 dark:hover:bg-amber-500"
                >
                  <LogIn size={16} aria-hidden="true" />
                  {STR.readonly.loginToEdit}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {readonly && (
                  <p className="text-sm text-amber-700 dark:text-amber-400">{STR.settings.readonlyNote}</p>
                )}
                <Button
                  variant="secondary"
                  onClick={() => logout.mutate()}
                  disabled={!online || logout.isPending}
                  title={!online ? STR.common.offlineDisabled : undefined}
                >
                  <LogOut size={16} aria-hidden="true" />
                  {STR.session.logout}
                </Button>
              </div>
            )}
          </div>
        </Card>

        {/* Podaci */}
        <Card>
          <CardHeader title={STR.settings.dataSection} />
          <div className="space-y-3 p-4">
            <dl className="grid grid-cols-2 gap-2 text-sm">
              <div className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800">
                <dt className="text-xs text-stone-500 dark:text-stone-400">{STR.settings.personsCount}</dt>
                <dd className="text-lg font-bold text-amber-800 dark:text-amber-400">
                  {tree ? tree.persons.length : '—'}
                </dd>
              </div>
              <div className="rounded-lg bg-stone-100 px-3 py-2 dark:bg-stone-800">
                <dt className="text-xs text-stone-500 dark:text-stone-400">{STR.settings.unionsCount}</dt>
                <dd className="text-lg font-bold text-amber-800 dark:text-amber-400">
                  {tree ? tree.unions.length : '—'}
                </dd>
              </div>
            </dl>
            <Link
              to="/gedcom"
              className="inline-flex items-center gap-1.5 text-sm font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
            >
              <FileText size={14} aria-hidden="true" />
              {STR.settings.gedcomLink}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
