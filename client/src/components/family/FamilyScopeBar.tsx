import { useMemo } from 'react';
import { Users } from 'lucide-react';
import type { TreeResponse } from '@shared/types';
import { computeFamilies } from '@shared/families';
import { Button } from '../ui/Button';
import { STR } from '../../lib/strings';

export interface FamilyScopeBarProps {
  /** Stablo već ograničeno na jednu porodicu (filterTreeToFamily). */
  familyTree: TreeResponse;
  /** „Promeni porodicu" — nazad na izbor porodice. */
  onChange: () => void;
}

/** Zaglavlje sa nazivom trenutno odabrane porodice + dugme za promenu. */
export function FamilyScopeBar({ familyTree, onChange }: FamilyScopeBarProps) {
  const label = useMemo(() => {
    const fam = computeFamilies(familyTree)[0];
    if (!fam) return '';
    const rep = familyTree.persons.find((p) => p.id === fam.representativeId);
    return rep ? rep.last_name.trim() || rep.first_name.trim() : '';
  }, [familyTree]);

  return (
    <div className="flex items-center justify-between gap-2 px-1">
      <h1 className="min-w-0 truncate font-display text-lg font-normal text-heading">
        {STR.tree.familyLabel}
        {label && <span className="ml-1 text-goldd">{label}</span>}
        <span className="ml-1.5 font-sans text-sm text-faint">
          · {familyTree.persons.length} {STR.tree.members}
        </span>
      </h1>
      <Button variant="secondary" size="sm" className="shrink-0" onClick={onChange}>
        <Users size={16} aria-hidden="true" />
        {STR.tree.changeFamily}
      </Button>
    </div>
  );
}
