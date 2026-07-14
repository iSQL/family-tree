import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { apiFetch, ApiError } from '../api/client';
import logoUrl from '../assets/zabari-logo.svg';
import { useSession } from '../hooks/useSession';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { STR } from '../lib/strings';

export default function LoginPage() {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [password, setPassword] = useState('');

  const login = useMutation({
    mutationFn: (pwd: string) => apiFetch('/api/auth/login', { method: 'POST', body: { password: pwd } }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      navigate('/', { replace: true });
    },
    onError: (err: unknown) => {
      if (err instanceof ApiError && err.status === 401) {
        toast.error(STR.login.wrongPassword);
      } else {
        toast.error(err instanceof Error ? err.message : STR.errors.generic);
      }
    },
  });

  // Već prijavljen (ili dev režim bez lozinke) → pravo na stablo
  if (session && (session.authenticated || session.auth_mode === 'disabled')) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <Card className="w-full max-w-sm p-7 text-center shadow-[0_24px_60px_-30px_rgba(20,30,50,.5)]">
        <div className="mb-5 flex flex-col items-center gap-1.5">
          <img
            src={logoUrl}
            alt=""
            width={72}
            height={72}
            aria-hidden="true"
            className="mb-2 rounded-full shadow-[0_4px_14px_-4px_rgba(20,30,50,.4)]"
          />
          <div className="zb-label text-[11px] tracking-[.28em] text-goldd">{STR.brand.municipality}</div>
          <h1 className="font-display text-2xl font-normal text-heading">{STR.appName}</h1>
          <p className="text-base text-muted">{STR.login.intro}</p>
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (password.trim() !== '') login.mutate(password);
          }}
          className="space-y-3"
        >
          <Input
            type="password"
            autoFocus
            autoComplete="current-password"
            aria-label={STR.login.password}
            placeholder={STR.login.password}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
          <Button
            type="submit"
            variant="gold"
            className="w-full py-3 text-[13px] tracking-[.12em]"
            disabled={login.isPending || password.trim() === ''}
          >
            {STR.login.submit}
          </Button>
        </form>
        <p className="mt-5 text-base text-faint italic">{STR.brand.tagline}</p>
      </Card>
    </div>
  );
}
