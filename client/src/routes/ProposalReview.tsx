import { useMemo, useState } from 'react';
import { Link, Navigate, useParams } from 'react-router-dom';
import { toast } from 'sonner';
import { ArrowLeft, GitMerge, Trash2 } from 'lucide-react';
import {
  BranchChangeList,
  SelectionBar,
  toggleSelection,
  withDependencies,
  withDependents,
} from '../components/proposals/BranchChangeList';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog } from '../components/ui/Dialog';
import { Spinner } from '../components/ui/Spinner';
import { useReadonly } from '../hooks/useAccess';
import { useOnline } from '../hooks/useOnline';
import { useProposalAdminMutations, useProposalToken, useTokenChanges } from '../hooks/useProposals';
import { formatTimestampDate } from '../lib/dates';
import { countOf } from '../lib/plural';
import { STR } from '../lib/strings';

const toastError = (err: unknown) => toast.error(err instanceof Error ? err.message : STR.errors.generic);

/** /settings/proposals/:tokenId — pregled grane: izbor izmena, spajanje u stablo, odbacivanje. */
export default function ProposalReviewPage() {
  const params = useParams<{ tokenId: string }>();
  const tokenId = Number(params.tokenId);
  const valid = Number.isInteger(tokenId) && tokenId > 0;
  const readonly = useReadonly();
  const online = useOnline();
  const token = useProposalToken(tokenId, valid && !readonly);
  const changesQuery = useTokenChanges(tokenId, valid && !readonly);
  const { merge, discard } = useProposalAdminMutations();
  /** null = podrazumevani izbor (sve bez konflikta i grešaka). */
  const [picked, setPicked] = useState<Set<string> | null>(null);
  const [confirm, setConfirm] = useState<'merge' | 'discard' | null>(null);

  const changes = useMemo(() => changesQuery.data?.changes ?? [], [changesQuery.data]);
  const selected = useMemo(() => {
    const keys = new Set(changes.map((c) => c.key));
    if (picked) return new Set([...picked].filter((k) => keys.has(k)));
    const ok = new Set(changes.filter((c) => c.status === 'ok').map((c) => c.key));
    return new Set([...ok].filter((k) => [...withDependencies(changes, [k])].every((d) => ok.has(d))));
  }, [changes, picked]);

  // UI zaštita; server svakako traži punu lozinku (requireFullAccess).
  if (readonly || !valid) return <Navigate to="/settings/proposals" replace />;

  const selectedKeys = changes.filter((c) => selected.has(c.key)).map((c) => c.key);
  const discardKeys = [...withDependents(changes, selectedKeys)];
  const brokenSelected = changes.some((c) => selected.has(c.key) && c.status === 'broken');
  const busy = merge.isPending || discard.isPending;

  const runMerge = () =>
    merge.mutate(
      { tokenId, keys: selectedKeys },
      {
        onSuccess: (result) => {
          toast.success(`${STR.proposals.merged} ${countOf(result.merged, STR.branch.changeForms)}`);
          setPicked(null);
          setConfirm(null);
        },
        onError: (err) => {
          setConfirm(null);
          toastError(err);
        },
      },
    );

  const runDiscard = () =>
    discard.mutate(
      { tokenId, keys: discardKeys },
      {
        onSuccess: () => {
          toast.success(STR.proposals.discarded);
          setPicked(null);
          setConfirm(null);
        },
        onError: (err) => {
          setConfirm(null);
          toastError(err);
        },
      },
    );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <Link to="/settings/proposals" className="inline-flex items-center gap-1 text-sm text-muted hover:text-heading">
          <ArrowLeft size={14} aria-hidden="true" />
          {STR.proposals.backToLinks}
        </Link>

        <div>
          <div className="zb-label text-[11px] tracking-[.24em] text-goldd">{STR.proposals.reviewKicker}</div>
          <h1 className="mt-0.5 font-display text-2xl font-normal text-heading">{token.data?.label ?? '…'}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{STR.proposals.reviewIntro}</p>
        </div>

        {token.data?.submitted_at && (
          <div className="rounded-xl border border-line bg-activebg px-3.5 py-2.5 text-sm text-activefg">
            <p>
              {STR.proposals.tokenSubmitted}: {token.data.submitted_by} · {formatTimestampDate(token.data.submitted_at)}
            </p>
            {token.data.submit_note && <p className="mt-1 whitespace-pre-line text-ink">„{token.data.submit_note}"</p>}
          </div>
        )}

        {changesQuery.isPending ? (
          <div className="flex justify-center py-10">
            <Spinner size={28} />
          </div>
        ) : changesQuery.isError || !changesQuery.data ? (
          <Card>
            <div className="space-y-3 p-6 text-center">
              <p className="text-base text-muted">{STR.proposals.loadFailed}</p>
              <Button variant="secondary" size="sm" onClick={() => void changesQuery.refetch()}>
                {STR.common.retry}
              </Button>
            </div>
          </Card>
        ) : changes.length === 0 ? (
          <Card>
            <p className="p-6 text-center text-base text-muted">{STR.proposals.emptyChanges}</p>
          </Card>
        ) : (
          <>
            <SelectionBar
              total={changes.length}
              selected={selectedKeys.length}
              onSelectAll={() => setPicked(new Set(changes.map((c) => c.key)))}
              onSelectNone={() => setPicked(new Set())}
            >
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setConfirm('discard')}
                disabled={!online || busy || selectedKeys.length === 0}
              >
                <Trash2 size={14} aria-hidden="true" />
                {STR.proposals.discardSelected}
              </Button>
              <Button
                size="sm"
                onClick={() => setConfirm('merge')}
                disabled={!online || busy || selectedKeys.length === 0 || brokenSelected}
                title={!online ? STR.common.offlineDisabled : undefined}
              >
                <GitMerge size={14} aria-hidden="true" />
                {STR.proposals.mergeSelected}
              </Button>
            </SelectionBar>
            {brokenSelected && <p className="text-sm text-danger">{STR.proposals.brokenSelected}</p>}
            <BranchChangeList
              data={changesQuery.data}
              selected={selected}
              onToggle={(key, checked) => setPicked(toggleSelection(changes, selected, key, checked, 'merge'))}
            />
          </>
        )}
      </div>

      <ConfirmDialog
        open={confirm === 'merge'}
        title={STR.proposals.confirmMergeTitle}
        text={`${STR.proposals.confirmMergeText} ${countOf(selectedKeys.length, STR.branch.changeForms)}.`}
        confirmLabel={STR.proposals.confirmMergeLabel}
        onConfirm={runMerge}
        onClose={() => setConfirm(null)}
        busy={merge.isPending}
      />
      <ConfirmDialog
        open={confirm === 'discard'}
        title={STR.proposals.confirmDiscardTitle}
        text={`${STR.proposals.confirmDiscardText} ${countOf(discardKeys.length, STR.branch.changeForms)}.`}
        confirmLabel={STR.proposals.discardSelected}
        onConfirm={runDiscard}
        onClose={() => setConfirm(null)}
        busy={discard.isPending}
      />
    </div>
  );
}
