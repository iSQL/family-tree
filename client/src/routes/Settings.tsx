import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { ChevronRight, Download, FileText, LogIn, LogOut, Monitor, Moon, Printer, Sun, type LucideIcon } from 'lucide-react';
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

/** Sklopiv blok sa numerisanim koracima za instalaciju (Android / iOS). */
function InstallSteps({ title, steps }: { title: string; steps: string[] }) {
  return (
    <details className="group rounded-xl border border-line">
      <summary className="flex cursor-pointer items-center gap-1.5 px-3 py-2 text-sm font-medium select-none">
        <ChevronRight
          size={14}
          aria-hidden="true"
          className="shrink-0 transition-transform group-open:rotate-90"
        />
        {title}
      </summary>
      <ol className="list-decimal space-y-1 px-3 pb-3 pl-9 text-base text-muted">
        {steps.map((step) => (
          <li key={step}>{step}</li>
        ))}
      </ol>
    </details>
  );
}

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
        <h1 className="font-display text-2xl font-normal text-heading">{STR.settings.title}</h1>

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

        {/* Izvoz postera */}
        <Card>
          <CardHeader title={STR.settings.posterSection} />
          <div className="space-y-3 p-4">
            <p className="text-base text-muted">{STR.settings.posterHint}</p>
            <Link
              to="/settings/poster"
              className="zb-label inline-flex items-center gap-1.5 rounded-[9px] bg-navy px-3 py-2 text-xs text-onnav shadow-[0_8px_20px_-8px_rgba(20,30,50,.5)] hover:bg-navy2"
            >
              <Printer size={16} aria-hidden="true" />
              {STR.settings.posterLink}
            </Link>
          </div>
        </Card>

        {/* Instalacija */}
        <Card>
          <CardHeader title={STR.settings.install} />
          <div className="space-y-3 p-4">
            <p className="text-base text-muted">{STR.settings.installHint}</p>
            {canInstall ? (
              <Button onClick={() => void promptInstall()}>
                <Download size={16} aria-hidden="true" />
                {STR.settings.installButton}
              </Button>
            ) : (
              <p className="text-sm text-faint">{STR.settings.installUnavailable}</p>
            )}
            <InstallSteps
              title={STR.settings.installAndroidTitle}
              steps={[STR.settings.installAndroid1, STR.settings.installAndroid2, STR.settings.installAndroid3]}
            />
            <InstallSteps
              title={STR.settings.installIosTitle}
              steps={[STR.settings.installIos1, STR.settings.installIos2, STR.settings.installIos3]}
            />
          </div>
        </Card>

        {/* Nalog */}
        <Card>
          <CardHeader title={STR.settings.account} />
          <div className="p-4">
            {session?.auth_mode === 'disabled' ? (
              <p className="text-base text-muted">{STR.settings.authDisabledNote}</p>
            ) : !session?.authenticated ? (
              // Neprijavljeni gost u režimu javnog čitanja
              <div className="space-y-3">
                <p className="text-base text-activefg">{STR.settings.readonlyNote}</p>
                <Link
                  to="/login"
                  className="zb-label inline-flex items-center gap-1.5 rounded-[9px] bg-navy px-3 py-2 text-xs text-onnav shadow-[0_8px_20px_-8px_rgba(20,30,50,.5)] hover:bg-navy2"
                >
                  <LogIn size={16} aria-hidden="true" />
                  {STR.readonly.loginToEdit}
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {readonly && (
                  <p className="text-base text-activefg">{STR.settings.readonlyNote}</p>
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
              <div className="rounded-xl border border-line bg-bg px-3 py-2">
                <dt className="zb-label text-[10px] tracking-[.12em] text-faint">{STR.settings.personsCount}</dt>
                <dd className="font-display text-2xl font-normal text-goldd">
                  {tree ? tree.persons.length : '—'}
                </dd>
              </div>
              <div className="rounded-xl border border-line bg-bg px-3 py-2">
                <dt className="zb-label text-[10px] tracking-[.12em] text-faint">{STR.settings.unionsCount}</dt>
                <dd className="font-display text-2xl font-normal text-goldd">
                  {tree ? tree.unions.length : '—'}
                </dd>
              </div>
            </dl>
            <Link
              to="/gedcom"
              className="zb-label inline-flex items-center gap-1.5 rounded-[9px] bg-navy px-3 py-2 text-xs text-onnav shadow-[0_8px_20px_-8px_rgba(20,30,50,.5)] hover:bg-navy2"
            >
              <FileText size={16} aria-hidden="true" />
              {STR.settings.gedcomLink}
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}
