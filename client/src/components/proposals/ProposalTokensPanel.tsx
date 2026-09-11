import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Copy, Eye, Plus, Trash2 } from 'lucide-react';
import { PROPOSAL_TOKEN_DAYS, createProposalTokenSchema, type CreateProposalTokenInput } from '@shared/schemas';
import type { ProposalToken } from '@shared/types';
import { useOnline } from '../../hooks/useOnline';
import { inviteUrl, useProposalAdminMutations, useProposalTokens } from '../../hooks/useProposals';
import { formatTimestampDate } from '../../lib/dates';
import { countOf } from '../../lib/plural';
import { STR } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Card, CardHeader } from '../ui/Card';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { Spinner } from '../ui/Spinner';

interface TokenFormValues {
  label: string;
  expires_in_days: number;
}

const resolver = zodResolver(createProposalTokenSchema) as unknown as Resolver<
  TokenFormValues,
  unknown,
  CreateProposalTokenInput
>;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : STR.errors.generic);

async function copyInvite(token: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(inviteUrl(token));
    toast.success(STR.proposals.copied);
  } catch {
    // clipboard ne postoji van HTTPS-a ili je odbijen
    toast.error(STR.proposals.copyFailed);
  }
}

function tokenState(t: ProposalToken): 'active' | 'expired' | 'revoked' {
  if (t.revoked) return 'revoked';
  return Date.parse(t.expires_at) > Date.now() ? 'active' : 'expired';
}

const STATE_LABEL = {
  active: STR.proposals.tokenActive,
  expired: STR.proposals.tokenExpired,
  revoked: STR.proposals.tokenRevoked,
} as const;

const STATE_STYLE = {
  active: 'bg-surface2 text-heading',
  expired: 'bg-surface2 text-muted',
  revoked: 'bg-surface2 text-danger',
} as const;

const BADGE = 'zb-label rounded-full px-2 py-0.5 text-[10px] tracking-[.12em]';

/** Pravljenje, kopiranje i opoziv pozivnih linkova; svaki link je jedna grana za pregled. */
export function ProposalTokensPanel() {
  const online = useOnline();
  const { data: tokens, isLoading, isError, refetch } = useProposalTokens();
  const { createToken, revokeToken } = useProposalAdminMutations();
  const [created, setCreated] = useState<ProposalToken | null>(null);
  const [revoking, setRevoking] = useState<ProposalToken | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<TokenFormValues, unknown, CreateProposalTokenInput>({
    resolver,
    defaultValues: { label: '', expires_in_days: 30 },
  });

  const onCreate = (input: CreateProposalTokenInput) => {
    createToken.mutate(input, {
      onSuccess: (token) => {
        reset();
        setCreated(token);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  const confirmRevoke = () => {
    if (!revoking) return;
    revokeToken.mutate(revoking.id, {
      onSuccess: () => {
        toast.success(STR.proposals.revoked);
        setRevoking(null);
      },
      onError: (err) => toast.error(errorMessage(err)),
    });
  };

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader title={STR.proposals.newToken} />
        <form onSubmit={handleSubmit(onCreate)} className="space-y-3 p-4" noValidate>
          <p className="text-sm leading-relaxed text-muted">{STR.proposals.tokenIntro}</p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_10rem]">
            <Field label={STR.proposals.tokenLabel} error={errors.label?.message}>
              <Input {...register('label')} placeholder={STR.proposals.tokenLabelPlaceholder} autoComplete="off" />
            </Field>
            <Field label={STR.proposals.tokenDuration}>
              <Select {...register('expires_in_days', { valueAsNumber: true })}>
                {PROPOSAL_TOKEN_DAYS.map((days) => (
                  <option key={days} value={days}>
                    {days} {STR.proposals.tokenDays}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="flex justify-end">
            <Button
              type="submit"
              disabled={!online || createToken.isPending}
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              <Plus size={14} aria-hidden="true" />
              {STR.proposals.createToken}
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader title={STR.proposals.tokensTitle} />
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={24} />
          </div>
        ) : isError || !tokens ? (
          <div className="space-y-3 p-6 text-center">
            <p className="text-base text-muted">{STR.proposals.loadFailed}</p>
            <Button variant="secondary" size="sm" onClick={() => void refetch()}>
              {STR.common.retry}
            </Button>
          </div>
        ) : tokens.length === 0 ? (
          <p className="p-6 text-center text-base text-muted">{STR.proposals.noTokens}</p>
        ) : (
          <ul className="divide-y divide-line">
            {tokens.map((t) => {
              const state = tokenState(t);
              return (
                <li key={t.id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0 space-y-0.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium text-heading">{t.label}</span>
                      <span className={`${BADGE} ${STATE_STYLE[state]}`}>{STATE_LABEL[state]}</span>
                      {t.submitted_at && t.change_count > 0 && (
                        <span className={`${BADGE} bg-activebg text-activefg`}>{STR.proposals.tokenSubmitted}</span>
                      )}
                    </div>
                    <p className="text-xs text-muted">
                      {countOf(t.change_count, STR.branch.changeForms)}
                      {` · ${STR.proposals.tokenCreated}: ${formatTimestampDate(t.created_at)}`}
                      {` · ${STR.proposals.tokenExpires}: ${formatTimestampDate(t.expires_at)}`}
                    </p>
                    {t.submitted_at && t.change_count > 0 && (
                      <p className="text-xs text-activefg">
                        {STR.proposals.submittedBy}: {t.submitted_by} · {formatTimestampDate(t.submitted_at)}
                        {t.submit_note ? ` — „${t.submit_note}"` : ''}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Link
                      to={`/settings/proposals/${t.id}`}
                      className="zb-label inline-flex items-center gap-1.5 rounded-[9px] bg-navy px-2.5 py-1.5 text-[11px] text-onnav hover:bg-navy2"
                    >
                      <Eye size={13} aria-hidden="true" />
                      {STR.proposals.review}
                    </Link>
                    {state === 'active' && (
                      <Button variant="secondary" size="sm" onClick={() => void copyInvite(t.token)}>
                        <Copy size={13} aria-hidden="true" />
                        {STR.proposals.copyLink}
                      </Button>
                    )}
                    {!t.revoked && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRevoking(t)}
                        disabled={!online}
                        aria-label={`${STR.proposals.revoke}: ${t.label}`}
                      >
                        <Trash2 size={15} className="text-danger" aria-hidden="true" />
                      </Button>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Card>

      {created && (
        <Dialog
          open
          onClose={() => setCreated(null)}
          title={STR.proposals.tokenCreatedTitle}
          footer={
            <>
              <Button variant="secondary" onClick={() => setCreated(null)}>
                {STR.common.close}
              </Button>
              <Button onClick={() => void copyInvite(created.token)}>
                <Copy size={14} aria-hidden="true" />
                {STR.proposals.copyLink}
              </Button>
            </>
          }
        >
          <p className="text-base text-muted">
            {STR.proposals.tokenCreatedText} {formatTimestampDate(created.expires_at)}
          </p>
          <Input
            readOnly
            value={inviteUrl(created.token)}
            onFocus={(e) => e.currentTarget.select()}
            className="mt-3"
            aria-label={STR.proposals.copyLink}
          />
        </Dialog>
      )}

      <ConfirmDialog
        open={revoking !== null}
        title={STR.proposals.confirmRevokeTitle}
        text={STR.proposals.confirmRevokeText}
        confirmLabel={STR.proposals.revoke}
        onConfirm={confirmRevoke}
        onClose={() => setRevoking(null)}
        busy={revokeToken.isPending}
      />
    </div>
  );
}
