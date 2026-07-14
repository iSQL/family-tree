import { X } from 'lucide-react';
import { usePerson } from '../../hooks/usePerson';
import { PersonDetailContent } from './PersonDetailContent';
import { FullScreenSpinner } from '../ui/Spinner';
import { STR } from '../../lib/strings';

export interface PersonDrawerProps {
  personId: number;
  onClose: () => void;
  /** Refokusira stablo na izabranog srodnika. */
  onFocusPerson: (id: number) => void;
  /** „Prikaži stablo odavde" — re-root na trenutno otvorenu osobu. */
  onShowInTree: (id: number) => void;
}

/** Desni drawer (≥768px) sa punim detaljima osobe. */
export function PersonDrawer({ personId, onClose, onFocusPerson, onShowInTree }: PersonDrawerProps) {
  const { data: person, isPending, isError } = usePerson(personId);

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-full flex-col border-l border-line bg-surface shadow-[-16px_0_40px_-20px_rgba(20,30,50,.4)]">
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <h2 className="zb-label text-xs text-muted">
          {person ? `${person.first_name} ${person.last_name}` : STR.common.loading}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={STR.common.close}
          className="cursor-pointer rounded-md p-2 text-muted hover:bg-surface2"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isPending ? (
          <FullScreenSpinner />
        ) : isError || !person ? (
          <p className="text-sm text-muted">{STR.person.notFound}</p>
        ) : (
          <PersonDetailContent
            person={person}
            onPersonClick={onFocusPerson}
            onShowInTree={onShowInTree}
            onDeleted={onClose}
          />
        )}
      </div>
    </aside>
  );
}
