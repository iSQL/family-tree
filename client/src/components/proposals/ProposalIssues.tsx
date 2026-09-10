import { AlertCircle, AlertTriangle } from 'lucide-react';
import type { ProposalIssue } from '@shared/types';
import { STR } from '../../lib/strings';

export interface ProposalIssuesProps {
  issues: ProposalIssue[];
  /** Naslov bloka grešaka (saradnik: pre slanja; administrator: pre spajanja). */
  errorsTitle: string;
}

/** Greške (blokiraju) i upozorenja (odlučuje čovek) iz provere predloga. */
export function ProposalIssues({ issues, errorsTitle }: ProposalIssuesProps) {
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');
  if (errors.length === 0 && warnings.length === 0) return null;

  return (
    <div className="space-y-2">
      {errors.length > 0 && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/5 p-3">
          <p className="zb-label mb-1.5 text-[11px] tracking-[.16em] text-danger">{errorsTitle}</p>
          <ul className="space-y-1 text-sm text-ink">
            {errors.map((issue, i) => (
              <li key={i} className="flex gap-1.5">
                <AlertCircle size={15} className="mt-0.5 shrink-0 text-danger" aria-hidden="true" />
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
      {warnings.length > 0 && (
        <div className="rounded-xl border border-line bg-activebg p-3">
          <p className="zb-label mb-1.5 text-[11px] tracking-[.16em] text-activefg">{STR.proposals.warningsTitle}</p>
          <ul className="space-y-1 text-sm text-ink">
            {warnings.map((issue, i) => (
              <li key={i} className="flex gap-1.5">
                <AlertTriangle size={15} className="mt-0.5 shrink-0 text-activefg" aria-hidden="true" />
                {issue.message}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
