import type { ProposalStatus } from '@shared/types';
import { STR } from '../../lib/strings';

const STYLES: Record<ProposalStatus, string> = {
  pending: 'bg-activebg text-activefg',
  approved: 'bg-surface2 text-heading',
  rejected: 'bg-surface2 text-danger',
};

const LABELS: Record<ProposalStatus, string> = {
  pending: STR.proposals.statusPending,
  approved: STR.proposals.statusApproved,
  rejected: STR.proposals.statusRejected,
};

export function ProposalStatusBadge({ status }: { status: ProposalStatus }) {
  return (
    <span className={`zb-label rounded-full px-2 py-0.5 text-[10px] tracking-[.12em] ${STYLES[status]}`}>
      {LABELS[status]}
    </span>
  );
}
