import { Navigate } from 'react-router-dom';
import { ProposalTokensPanel } from '../components/proposals/ProposalTokensPanel';
import { useReadonly } from '../hooks/useAccess';
import { STR } from '../lib/strings';

/** /settings/proposals — pozivni linkovi (grane) i ulaz u njihov pregled (samo pun pristup). */
export default function ProposalsPage() {
  const readonly = useReadonly();
  // UI zaštita; server svakako traži punu lozinku (requireFullAccess).
  if (readonly) return <Navigate to="/settings" replace />;

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-3xl space-y-4 p-4">
        <div>
          <div className="zb-label text-[11px] tracking-[.24em] text-goldd">{STR.proposals.kicker}</div>
          <h1 className="mt-0.5 font-display text-2xl font-normal text-heading">{STR.proposals.title}</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-muted">{STR.proposals.intro}</p>
        </div>
        <ProposalTokensPanel />
      </div>
    </div>
  );
}
