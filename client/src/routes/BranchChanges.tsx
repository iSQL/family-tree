import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { Send, Undo2 } from 'lucide-react';
import { submitBranchSchema, type SubmitBranchInput } from '@shared/schemas';
import { BranchChangeList, SelectionBar, toggleSelection } from '../components/proposals/BranchChangeList';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Field, Textarea } from '../components/ui/Input';
import { Spinner } from '../components/ui/Spinner';
import { useBranch } from '../hooks/useAccess';
import { useOnline } from '../hooks/useOnline';
import { useBranchChanges, useBranchMutations } from '../hooks/useProposals';
import { formatTimestampDate } from '../lib/dates';
import { countOf } from '../lib/plural';
import { STR } from '../lib/strings';

const resolver = zodResolver(submitBranchSchema) as unknown as Resolver<{ note: string }, unknown, SubmitBranchInput>;

const toastError = (err: unknown) => toast.error(err instanceof Error ? err.message : STR.errors.generic);

/** /moje-izmene — izmene zajedničke grane: poništavanje i slanje na odobrenje. */
export default function BranchChangesPage() {
  const branch = useBranch();
  const online = useOnline();
  const { data, isPending, isError, refetch } = useBranchChanges(branch !== null);
  const { discard, submit } = useBranchMutations();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [confirmOpen, setConfirmOpen] = useState(false);
  const { register, handleSubmit, reset } = useForm<{ note: string }, unknown, SubmitBranchInput>({
    resolver,
    defaultValues: { note: '' },
  });

  if (!branch) return <Navigate to="/" replace />;

  const changes = data?.changes ?? [];
  const selectedKeys = changes.filter((c) => selected.has(c.key)).map((c) => c.key);

  const onSubmit = (input: SubmitBranchInput) =>
    submit.mutate(input, {
      onSuccess: () => {
        reset();
        toast.success(STR.branch.submitted);
      },
      onError: toastError,
    });

  const confirmDiscard = () =>
    discard.mutate(selectedKeys, {
      onSuccess: () => {
        setSelected(new Set());
        setConfirmOpen(false);
        toast.success(STR.branch.discarded);
      },
      onError: (err) => {
        setConfirmOpen(false);
        toastError(err);
      },
    });

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <div>
          <div className="zb-label text-[11px] tracking-[.24em] text-goldd">{STR.branch.kicker}</div>
          <h1 className="mt-0.5 font-display text-2xl font-normal text-heading">{STR.branch.changesTitle}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{STR.branch.changesIntro}</p>
        </div>

        <Card>
          <CardHeader title={STR.branch.submitTitle} />
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-3 p-4" noValidate>
            {branch.submitted_at && (
              <p className="text-sm text-activefg">
                {STR.branch.submittedAt}: {formatTimestampDate(branch.submitted_at)}. {STR.branch.submitAgainHint}
              </p>
            )}
            <Field label={STR.branch.submitNote}>
              <Textarea rows={2} {...register('note')} placeholder={STR.branch.submitNotePlaceholder} />
            </Field>
            <div className="flex justify-end">
              <Button
                type="submit"
                variant="gold"
                disabled={!online || submit.isPending || changes.length === 0}
                title={!online ? STR.common.offlineDisabled : undefined}
              >
                <Send size={14} aria-hidden="true" />
                {STR.branch.submit}
              </Button>
            </div>
          </form>
        </Card>

        {isPending ? (
          <div className="flex justify-center py-10">
            <Spinner size={28} />
          </div>
        ) : isError || !data ? (
          <Card>
            <div className="space-y-3 p-6 text-center">
              <p className="text-base text-muted">{STR.proposals.loadFailed}</p>
              <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                {STR.common.retry}
              </Button>
            </div>
          </Card>
        ) : changes.length === 0 ? (
          <Card>
            <p className="p-6 text-center text-base text-muted">{STR.branch.emptyChanges}</p>
          </Card>
        ) : (
          <>
            <SelectionBar
              total={changes.length}
              selected={selectedKeys.length}
              onSelectAll={() => setSelected(new Set(changes.map((c) => c.key)))}
              onSelectNone={() => setSelected(new Set())}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirmOpen(true)}
                disabled={!online || discard.isPending || selectedKeys.length === 0}
              >
                <Undo2 size={14} aria-hidden="true" />
                {STR.branch.discardSelected}
              </Button>
            </SelectionBar>
            <BranchChangeList
              data={data}
              selected={selected}
              onToggle={(key, checked) => setSelected((prev) => toggleSelection(changes, prev, key, checked, 'discard'))}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title={STR.branch.confirmDiscardTitle}
        text={`${STR.branch.confirmDiscardText} ${countOf(selectedKeys.length, STR.branch.changeForms)}.`}
        confirmLabel={STR.branch.discardSelected}
        onConfirm={confirmDiscard}
        onClose={() => setConfirmOpen(false)}
        busy={discard.isPending}
      />
    </div>
  );
}
