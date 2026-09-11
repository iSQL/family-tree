import { Link, useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { GitBranch, LogOut } from 'lucide-react';
import { useBranch } from '../../hooks/useAccess';
import { useBranchChanges, useBranchMutations } from '../../hooks/useProposals';
import { countOf } from '../../lib/plural';
import { STR } from '../../lib/strings';

/** Traka režima predloga: link, broj izmena u grani (vodi na pregled) i izlazak. */
export function BranchBanner() {
  const branch = useBranch();
  const { data } = useBranchChanges(branch !== null);
  const { exit } = useBranchMutations();
  const navigate = useNavigate();
  if (!branch) return null;

  const leave = () =>
    exit.mutate(undefined, {
      onSuccess: () => {
        toast.success(STR.branch.exited);
        navigate('/', { replace: true });
      },
      onError: (err) => toast.error(err instanceof Error ? err.message : STR.errors.generic),
    });

  return (
    <div className="zb-label flex flex-wrap items-center justify-center gap-x-3 gap-y-1 bg-activebg px-3 py-1.5 text-center text-xs text-activefg">
      <span className="flex items-center gap-2">
        <GitBranch size={16} aria-hidden="true" />
        {STR.branch.banner}: {branch.label}
      </span>
      <Link to="/moje-izmene" className="underline underline-offset-2 hover:opacity-80">
        {countOf(data?.changes.length ?? 0, STR.branch.changeForms)}
      </Link>
      <button
        type="button"
        onClick={leave}
        disabled={exit.isPending}
        className="flex cursor-pointer items-center gap-1 underline underline-offset-2 hover:opacity-80 disabled:opacity-50"
      >
        <LogOut size={13} aria-hidden="true" />
        {STR.branch.exit}
      </button>
    </div>
  );
}
