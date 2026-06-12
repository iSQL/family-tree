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
}

/** Desni drawer (≥768px) sa punim detaljima osobe. */
export function PersonDrawer({ personId, onClose, onFocusPerson }: PersonDrawerProps) {
  const { data: person, isPending, isError } = usePerson(personId);

  return (
    <aside className="absolute inset-y-0 right-0 z-20 flex w-[400px] max-w-full flex-col border-l border-stone-200 bg-white shadow-xl dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2.5 dark:border-stone-700">
        <h2 className="text-sm font-semibold text-stone-500 dark:text-stone-400">
          {person ? `${person.first_name} ${person.last_name}` : STR.common.loading}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label={STR.common.close}
          className="cursor-pointer rounded-md p-1 text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-700/70"
        >
          <X size={18} />
        </button>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        {isPending ? (
          <FullScreenSpinner />
        ) : isError || !person ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{STR.person.notFound}</p>
        ) : (
          <PersonDetailContent person={person} onPersonClick={onFocusPerson} onDeleted={onClose} />
        )}
      </div>
    </aside>
  );
}
