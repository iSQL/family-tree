import { useState } from 'react';
import { Navigate } from 'react-router-dom';
import { Eye, GitPullRequest, Link as LinkIcon } from 'lucide-react';
import { ProposalReviewDialog } from '../components/proposals/ProposalReviewDialog';
import { ProposalStatusBadge } from '../components/proposals/ProposalStatusBadge';
import { ProposalTokensPanel } from '../components/proposals/ProposalTokensPanel';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { Spinner } from '../components/ui/Spinner';
import { useReadonly } from '../hooks/useAccess';
import { useProposalList, type ProposalFilter } from '../hooks/useProposals';
import { formatTimestampDate } from '../lib/dates';
import { countOf } from '../lib/plural';
import { STR } from '../lib/strings';

const FILTERS: { value: ProposalFilter; label: string }[] = [
  { value: 'pending', label: STR.proposals.filterPending },
  { value: 'approved', label: STR.proposals.filterApproved },
  { value: 'rejected', label: STR.proposals.filterRejected },
  { value: 'all', label: STR.proposals.filterAll },
];

type Tab = 'proposals' | 'tokens';

/** /settings/proposals — pozivni linkovi i pregled predloga rođaka (samo pun pristup). */
export default function ProposalsPage() {
  const readonly = useReadonly();
  const [tab, setTab] = useState<Tab>('proposals');
  const [filter, setFilter] = useState<ProposalFilter>('pending');
  const [openId, setOpenId] = useState<number | null>(null);
  const { data: proposals, isLoading, isError, refetch } = useProposalList(filter, !readonly && tab === 'proposals');

  // UI zaštita; server svakako traži punu lozinku (requireFullAccess).
  if (readonly) return <Navigate to="/settings" replace />;

  const tabButton = (value: Tab, label: string, icon: React.ReactNode) => (
    <Button
      variant={tab === value ? 'primary' : 'secondary'}
      size="sm"
      aria-pressed={tab === value}
      onClick={() => setTab(value)}
    >
      {icon}
      {label}
    </Button>
  );

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <div>
          <div className="zb-label text-[11px] tracking-[.24em] text-goldd">{STR.proposals.kicker}</div>
          <h1 className="mt-0.5 font-display text-2xl font-normal text-heading">{STR.proposals.title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{STR.proposals.intro}</p>
        </div>

        <div className="flex flex-wrap gap-2">
          {tabButton('proposals', STR.proposals.tabProposals, <GitPullRequest size={14} aria-hidden="true" />)}
          {tabButton('tokens', STR.proposals.tabTokens, <LinkIcon size={14} aria-hidden="true" />)}
        </div>

        {tab === 'tokens' ? (
          <ProposalTokensPanel />
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-1.5">
              {FILTERS.map((f) => (
                <Button
                  key={f.value}
                  size="sm"
                  variant={filter === f.value ? 'secondary' : 'ghost'}
                  aria-pressed={filter === f.value}
                  onClick={() => setFilter(f.value)}
                >
                  {f.label}
                </Button>
              ))}
            </div>

            {isLoading ? (
              <div className="flex justify-center py-10">
                <Spinner size={28} />
              </div>
            ) : isError || !proposals ? (
              <Card>
                <div className="space-y-3 p-6 text-center">
                  <p className="text-base text-muted">{STR.proposals.loadFailed}</p>
                  <Button variant="secondary" size="sm" onClick={() => void refetch()}>
                    {STR.common.retry}
                  </Button>
                </div>
              </Card>
            ) : proposals.length === 0 ? (
              <Card>
                <div className="space-y-3 p-6 text-center">
                  <p className="text-base text-heading">
                    {filter === 'pending' ? STR.proposals.emptyPending : STR.proposals.emptyOther}
                  </p>
                  <p className="text-sm text-muted">{STR.proposals.emptyHint}</p>
                  <Button variant="secondary" size="sm" onClick={() => setTab('tokens')}>
                    <LinkIcon size={14} aria-hidden="true" />
                    {STR.proposals.goToTokens}
                  </Button>
                </div>
              </Card>
            ) : (
              proposals.map((p) => (
                <Card key={p.id}>
                  <div className="flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-medium text-heading">{p.author_name}</span>
                        <ProposalStatusBadge status={p.status} />
                      </div>
                      <p className="text-xs text-muted">
                        {[
                          countOf(p.person_count, STR.proposals.personForms),
                          p.union_count > 0 ? countOf(p.union_count, STR.proposals.unionForms) : null,
                          p.token_label ? `${STR.proposals.via}: ${p.token_label}` : null,
                          `${STR.proposals.submittedAt}: ${formatTimestampDate(p.created_at)}`,
                        ]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                      {p.notes && <p className="line-clamp-2 text-sm text-ink">„{p.notes}"</p>}
                    </div>
                    <Button variant="secondary" size="sm" onClick={() => setOpenId(p.id)}>
                      <Eye size={14} aria-hidden="true" />
                      {STR.proposals.open}
                    </Button>
                  </div>
                </Card>
              ))
            )}
          </div>
        )}
      </div>

      {openId !== null && <ProposalReviewDialog proposalId={openId} onClose={() => setOpenId(null)} />}
    </div>
  );
}
