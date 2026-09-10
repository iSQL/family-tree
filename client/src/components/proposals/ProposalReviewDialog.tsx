import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Check, XCircle } from 'lucide-react';
import { checkProposal, personName } from '@shared/proposalCheck';
import { rejectProposalSchema, type RejectProposalInput } from '@shared/schemas';
import type { PersonRef, PersonSlim, ProposalIssue, ProposalMerge } from '@shared/types';
import { ApiError } from '../../api/client';
import { useOnline } from '../../hooks/useOnline';
import { useProposal, useProposalAdminMutations } from '../../hooks/useProposals';
import { useTree } from '../../hooks/useTree';
import { formatLifespan, formatPartialDate, formatTimestampDate } from '../../lib/dates';
import { countOf } from '../../lib/plural';
import { describeRelations, formatProposedLife, genderLabel } from '../../lib/proposalDraft';
import { STR } from '../../lib/strings';
import { RelativePicker } from '../person/RelativePicker';
import { Button } from '../ui/Button';
import { ConfirmDialog, Dialog } from '../ui/Dialog';
import { Field, Textarea } from '../ui/Input';
import { Spinner } from '../ui/Spinner';
import { ProposalIssues } from './ProposalIssues';
import { ProposalStatusBadge } from './ProposalStatusBadge';

const rejectResolver = zodResolver(rejectProposalSchema) as unknown as Resolver<
  { review_notes: string },
  unknown,
  RejectProposalInput
>;

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : STR.errors.generic);

function withLifespan(p: PersonSlim): string {
  const span = formatLifespan(p.birth_date, p.death_date);
  return span ? `${personName(p)} (${span})` : personName(p);
}

function RejectDialog({
  busy,
  onConfirm,
  onClose,
}: {
  busy: boolean;
  onConfirm: (input: RejectProposalInput) => void;
  onClose: () => void;
}) {
  const { register, handleSubmit } = useForm<{ review_notes: string }, unknown, RejectProposalInput>({
    resolver: rejectResolver,
    defaultValues: { review_notes: '' },
  });
  return (
    <Dialog
      open
      onClose={onClose}
      title={STR.proposals.confirmRejectTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {STR.common.cancel}
          </Button>
          <Button variant="danger" type="submit" form="reject-proposal-form" disabled={busy}>
            {STR.proposals.reject}
          </Button>
        </>
      }
    >
      <form id="reject-proposal-form" onSubmit={handleSubmit(onConfirm)} className="space-y-3" noValidate>
        <p className="text-base text-muted">{STR.proposals.confirmRejectText}</p>
        <Field label={STR.proposals.rejectNotesLabel}>
          <Textarea rows={3} placeholder={STR.proposals.rejectNotesPlaceholder} {...register('review_notes')} />
        </Field>
      </form>
    </Dialog>
  );
}

export interface ProposalReviewDialogProps {
  proposalId: number;
  onClose: () => void;
}

/** Pregled predloga („pull request"): provera, rešavanje duplikata, spajanje ili odbijanje. */
export function ProposalReviewDialog({ proposalId, onClose }: ProposalReviewDialogProps) {
  const { data: proposal, isLoading, isError } = useProposal(proposalId);
  const { data: tree } = useTree();
  const online = useOnline();
  const { approve, reject } = useProposalAdminMutations();
  const [merges, setMerges] = useState<Record<string, number>>({});
  const [confirmApproveOpen, setConfirmApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [serverIssues, setServerIssues] = useState<ProposalIssue[]>([]);

  const pending = proposal?.status === 'pending';
  const mergeList = useMemo<ProposalMerge[]>(
    () => Object.entries(merges).map(([temp_id, person_id]) => ({ temp_id, person_id })),
    [merges],
  );
  // Provera uživo nad keširanim stablom; server je ponavlja pri spajanju (409 ako se nešto promenilo).
  const check = useMemo(
    () => (proposal && tree && pending ? checkProposal(tree, proposal.data, { merges: mergeList }) : null),
    [proposal, tree, pending, mergeList],
  );
  const personsById = useMemo(() => new Map((tree?.persons ?? []).map((p) => [p.id, p])), [tree]);
  const busy = approve.isPending || reject.isPending;

  const setMerge = (tempId: string, personId: number | null) => {
    setServerIssues([]);
    setMerges((prev) => {
      const next = { ...prev };
      if (personId === null) delete next[tempId];
      else next[tempId] = personId;
      return next;
    });
  };

  const nameOf = (ref: PersonRef): string => {
    if (!proposal) return '?';
    if (typeof ref === 'string') {
      const p = proposal.data.persons.find((x) => x.temp_id === ref);
      return p ? personName(p) : '?';
    }
    const snap = proposal.data.refs[String(ref)];
    const current = personsById.get(ref);
    return snap ? personName(snap) : current ? personName(current) : `#${ref}`;
  };

  const approveSummary = (): string => {
    if (!proposal || !check) return STR.proposals.confirmApproveText;
    const parts = [countOf(proposal.data.persons.length - mergeList.length, STR.proposals.personForms)];
    const unions = proposal.data.unions.length - check.issues.filter((i) => i.code === 'union_exists').length;
    if (unions > 0) parts.push(countOf(unions, STR.proposals.unionForms));
    if (proposal.data.parent_links.length > 0) {
      parts.push(countOf(proposal.data.parent_links.length, STR.proposals.parentLinkForms));
    }
    if (mergeList.length > 0) parts.push(`${STR.proposals.mergedCount}: ${mergeList.length}`);
    return `${STR.proposals.confirmApproveText} ${parts.join(' · ')}.`;
  };

  const confirmApprove = () => {
    approve.mutate(
      { id: proposalId, merges: mergeList },
      {
        onSuccess: () => {
          toast.success(STR.proposals.approved);
          setConfirmApproveOpen(false);
          onClose();
        },
        onError: (err) => {
          setConfirmApproveOpen(false);
          const issues = err instanceof ApiError ? err.body?.issues : undefined;
          setServerIssues(Array.isArray(issues) ? (issues as ProposalIssue[]) : []);
          toast.error(errorMessage(err));
        },
      },
    );
  };

  const confirmReject = (input: RejectProposalInput) => {
    reject.mutate(
      { id: proposalId, ...input },
      {
        onSuccess: () => {
          toast.success(STR.proposals.rejected);
          setRejectOpen(false);
          onClose();
        },
        onError: (err) => toast.error(errorMessage(err)),
      },
    );
  };

  const footer = pending ? (
    <>
      <Button variant="secondary" onClick={() => setRejectOpen(true)} disabled={!online || busy}>
        <XCircle size={14} aria-hidden="true" />
        {STR.proposals.reject}
      </Button>
      <Button
        onClick={() => setConfirmApproveOpen(true)}
        disabled={!online || busy || !check?.can_approve}
        title={!online ? STR.common.offlineDisabled : undefined}
      >
        <Check size={14} aria-hidden="true" />
        {STR.proposals.approve}
      </Button>
    </>
  ) : (
    <Button variant="secondary" onClick={onClose}>
      {STR.common.close}
    </Button>
  );

  const metaLine = proposal
    ? [
        proposal.token_label ? `${STR.proposals.via}: ${proposal.token_label}` : null,
        `${STR.proposals.submittedAt}: ${formatTimestampDate(proposal.created_at)}`,
        proposal.reviewed_at ? `${STR.proposals.reviewedAt}: ${formatTimestampDate(proposal.reviewed_at)}` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : '';

  return (
    <>
      <Dialog open onClose={onClose} title={STR.proposals.reviewTitle} maxWidthClass="sm:max-w-2xl" footer={footer}>
        {isLoading ? (
          <div className="flex justify-center py-8">
            <Spinner size={28} />
          </div>
        ) : isError || !proposal ? (
          <p className="text-base text-danger">{STR.proposals.loadFailed}</p>
        ) : (
          <div className="space-y-4">
            <div className="space-y-1.5 rounded-xl border border-line bg-bg p-3.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-lg text-heading">{proposal.author_name}</span>
                <ProposalStatusBadge status={proposal.status} />
              </div>
              <p className="text-xs text-muted">{metaLine}</p>
              {proposal.notes && (
                <p className="border-t border-line pt-2 text-sm text-ink">
                  <span className="zb-label mr-1.5 text-[10px] tracking-[.12em] text-faint">
                    {STR.proposals.authorNotes}
                  </span>
                  {proposal.notes}
                </p>
              )}
              {proposal.review_notes && (
                <p className="border-t border-line pt-2 text-sm text-ink">
                  <span className="zb-label mr-1.5 text-[10px] tracking-[.12em] text-faint">
                    {STR.proposals.reviewNotes}
                  </span>
                  {proposal.review_notes}
                </p>
              )}
            </div>

            {check && <ProposalIssues issues={check.issues} errorsTitle={STR.proposals.errorsTitle} />}
            {check?.can_approve && serverIssues.length > 0 && (
              <ProposalIssues issues={serverIssues} errorsTitle={STR.proposals.errorsTitle} />
            )}

            <section className="space-y-2">
              <h3 className="zb-label text-[11px] tracking-[.16em] text-faint">
                {STR.proposals.personsSection} ({proposal.data.persons.length})
              </h3>
              {proposal.data.persons.map((p) => {
                const mergedId = merges[p.temp_id];
                const mergedWith = mergedId !== undefined ? personsById.get(mergedId) : undefined;
                const duplicate = check?.issues.find((i) => i.code === 'possible_duplicate' && i.temp_id === p.temp_id);
                const life = formatProposedLife(p);
                return (
                  <div key={p.temp_id} className="space-y-1.5 rounded-xl border border-line bg-cardbg p-3">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <span className="font-medium text-heading">
                        {p.title ? `${p.title} ` : ''}
                        {personName(p)}
                        {p.maiden_name ? ` (${STR.person.maidenShort} ${p.maiden_name})` : ''}
                      </span>
                      <span className="text-xs text-muted">{genderLabel(p.gender)}</span>
                    </div>
                    {life && <p className="text-xs text-muted">{life}</p>}
                    {describeRelations(proposal.data, p, nameOf).map((line) => (
                      <p key={line} className="text-sm text-ink">
                        {line}
                      </p>
                    ))}
                    {p.notes && <p className="text-sm whitespace-pre-line text-muted">{p.notes}</p>}

                    {pending &&
                      (mergedWith ? (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-activebg px-2.5 py-1.5 text-sm text-activefg">
                          <span>
                            {STR.proposals.mergeWith}: <strong>{withLifespan(mergedWith)}</strong>.{' '}
                            {STR.proposals.mergedNote}
                          </span>
                          <Button size="sm" variant="ghost" onClick={() => setMerge(p.temp_id, null)}>
                            {STR.proposals.mergeUndo}
                          </Button>
                        </div>
                      ) : (
                        <div className="space-y-1.5 border-t border-line pt-2">
                          {duplicate?.candidate_ids && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-xs text-activefg">{STR.proposals.possibleDuplicate}</span>
                              {duplicate.candidate_ids.map((id) => {
                                const candidate = personsById.get(id);
                                return candidate ? (
                                  <Button key={id} size="sm" variant="secondary" onClick={() => setMerge(p.temp_id, id)}>
                                    {STR.proposals.mergeWith} {withLifespan(candidate)}
                                  </Button>
                                ) : null;
                              })}
                            </div>
                          )}
                          <details>
                            <summary className="cursor-pointer text-xs text-muted select-none">
                              {STR.proposals.mergeLabel}
                            </summary>
                            <div className="pt-2">
                              <RelativePicker
                                persons={tree?.persons ?? []}
                                value={null}
                                onChange={(id) => setMerge(p.temp_id, id)}
                              />
                            </div>
                          </details>
                        </div>
                      ))}
                  </div>
                );
              })}
            </section>

            {proposal.data.unions.length > 0 && (
              <section className="space-y-2">
                <h3 className="zb-label text-[11px] tracking-[.16em] text-faint">
                  {STR.proposals.unionsSection} ({proposal.data.unions.length})
                </h3>
                <ul className="divide-y divide-line rounded-xl border border-line bg-cardbg">
                  {proposal.data.unions.map((u, i) => (
                    <li key={i} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 text-sm">
                      <span className="text-ink">
                        {nameOf(u.partner1_id)} — {nameOf(u.partner2_id)}
                      </span>
                      <span className="text-xs text-muted">
                        {u.type === 'marriage' ? STR.union.typeMarriage : STR.union.typePartnership}
                        {u.start_date ? ` · ${formatPartialDate(u.start_date)}` : ''}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        )}
      </Dialog>

      <ConfirmDialog
        open={confirmApproveOpen}
        title={STR.proposals.confirmApproveTitle}
        text={approveSummary()}
        confirmLabel={STR.proposals.confirmApproveLabel}
        onConfirm={confirmApprove}
        onClose={() => setConfirmApproveOpen(false)}
        busy={approve.isPending}
      />

      {rejectOpen && (
        <RejectDialog busy={reject.isPending} onConfirm={confirmReject} onClose={() => setRejectOpen(false)} />
      )}
    </>
  );
}
