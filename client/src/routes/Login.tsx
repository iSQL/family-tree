import { useState } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { TreeDeciduous } from 'lucide-react';
import { apiFetch, ApiError } from '../api/client';
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
      <Card className="w-full max-w-sm p-6">
        <div className="mb-5 flex flex-col items-center gap-2 text-center">
          <TreeDeciduous size={40} className="text-amber-700 dark:text-amber-400" aria-hidden="true" />
          <h1 className="text-xl font-bold">{STR.appName}</h1>
          <p className="text-sm text-stone-500 dark:text-stone-400">{STR.login.intro}</p>
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
          <Button type="submit" className="w-full" disabled={login.isPending || password.trim() === ''}>
            {STR.login.submit}
          </Button>
        </form>
      </Card>
    </div>
  );
}
