import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { AlertCircle, GitBranch } from 'lucide-react';
import { enterBranchSchema, type EnterBranchInput } from '@shared/schemas';
import { ApiError } from '../api/client';
import { Button } from '../components/ui/Button';
import { Field, Input } from '../components/ui/Input';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { useEnterBranch, usePublicToken } from '../hooks/useProposals';
import { useSession } from '../hooks/useSession';
import { formatTimestampDate } from '../lib/dates';
import { STR } from '../lib/strings';
import logoUrl from '../assets/zabari-logo.svg';

interface EnterValues {
  author_name: string;
}

const resolver = zodResolver(enterBranchSchema) as unknown as Resolver<EnterValues, unknown, EnterBranchInput>;

function Frame({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md space-y-4 rounded-2xl border border-line bg-surface p-6 shadow-[0_24px_60px_-30px_rgba(20,30,50,.6)]">
        {children}
      </div>
    </div>
  );
}

/** /predlog/:token — ulazak u režim predloga: ime autora, pa cela aplikacija nad granom linka. */
export default function EnterProposalPage() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const info = usePublicToken(token);
  const { data: session } = useSession();
  const enter = useEnterBranch(token);
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<EnterValues, unknown, EnterBranchInput>({
    resolver,
    defaultValues: { author_name: session?.branch?.author_name ?? '' },
  });

  if (info.isPending) {
    return (
      <div className="flex h-dvh items-center justify-center">
        <FullScreenSpinner />
      </div>
    );
  }

  if (info.isError || !info.data) {
    const invalid = info.error instanceof ApiError && info.error.status === 404;
    return (
      <Frame>
        <AlertCircle size={40} className="mx-auto text-danger" aria-hidden="true" />
        <h1 className="text-center font-display text-2xl font-normal text-heading">
          {invalid ? STR.branch.invalidTitle : STR.errors.generic}
        </h1>
        <p className="text-center text-base text-muted">{invalid ? STR.branch.invalidText : STR.branch.loadFailed}</p>
        {!invalid && (
          <div className="flex justify-center">
            <Button variant="secondary" onClick={() => void info.refetch()}>
              {STR.common.retry}
            </Button>
          </div>
        )}
      </Frame>
    );
  }

  const onSubmit = (input: EnterBranchInput) =>
    enter.mutate(input, {
      onSuccess: () => navigate('/', { replace: true }),
      onError: (err) => toast.error(err instanceof Error ? err.message : STR.errors.generic),
    });

  return (
    <Frame>
      <div className="flex items-center gap-2.5">
        <img src={logoUrl} alt="" width={32} height={32} className="rounded-full" />
        <span className="font-display text-lg text-heading">{STR.appName}</span>
      </div>
      <div>
        <div className="zb-label flex items-center gap-1.5 text-[11px] tracking-[.24em] text-goldd">
          <GitBranch size={14} aria-hidden="true" />
          {STR.branch.enterKicker}
        </div>
        <h1 className="mt-1 font-display text-2xl font-normal text-heading">{info.data.label}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">{STR.branch.enterIntro}</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{STR.branch.enterShared}</p>
        <p className="mt-2 text-xs text-faint">
          {STR.branch.validUntil} {formatTimestampDate(info.data.expires_at)}
        </p>
      </div>
      <form onSubmit={handleSubmit(onSubmit)} className="space-y-3" noValidate>
        <Field label={`${STR.branch.authorName} *`} error={errors.author_name?.message}>
          <Input
            {...register('author_name')}
            placeholder={STR.branch.authorNamePlaceholder}
            autoComplete="name"
            autoFocus
          />
        </Field>
        <p className="text-xs text-faint">{STR.branch.authorHint}</p>
        <Button type="submit" className="w-full" disabled={enter.isPending}>
          <GitBranch size={16} aria-hidden="true" />
          {STR.branch.enter}
        </Button>
      </form>
    </Frame>
  );
}
