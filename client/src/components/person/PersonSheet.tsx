import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { usePerson } from '../../hooks/usePerson';
import { PersonDetailContent } from './PersonDetailContent';
import { FullScreenSpinner } from '../ui/Spinner';
import { STR } from '../../lib/strings';

export interface PersonSheetProps {
  personId: number;
  onClose: () => void;
  /** Klik na srodnika — refokusira stablo i prati osobu. */
  onFocusPerson: (id: number) => void;
  /** „Prikaži stablo odavde" — re-root na trenutno otvorenu osobu. */
  onShowInTree: (id: number) => void;
}

/** Zatvori ako je povučeno niže od ovoga, ili na brz pokret naniže. */
const DISMISS_PX = 120;
const FLICK_VELOCITY = 0.6; // px/ms

/** Mobilni bottom sheet (<768px) sa punim detaljima osobe — klizi odozdo, povlačenjem se zatvara. */
export function PersonSheet({ personId, onClose, onFocusPerson, onShowInTree }: PersonSheetProps) {
  const { data: person, isPending, isError } = usePerson(personId);
  const [dragY, setDragY] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ y: number; t: number } | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const onPointerDown = (e: React.PointerEvent) => {
    // Ne hvataj kao drag ako je krenulo sa dugmeta (X) — pusti njegov klik.
    if ((e.target as HTMLElement).closest('button')) return;
    startRef.current = { y: e.clientY, t: e.timeStamp };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!startRef.current) return;
    setDragY(Math.max(0, e.clientY - startRef.current.y));
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = startRef.current;
    startRef.current = null;
    setDragging(false);
    if (!start) return;
    const dy = Math.max(0, e.clientY - start.y);
    const velocity = dy / Math.max(1, e.timeStamp - start.t);
    if (dy > DISMISS_PX || (dy > 40 && velocity > FLICK_VELOCITY)) onClose();
    else setDragY(0);
  };

  const name = person ? `${person.first_name} ${person.last_name}` : STR.common.loading;

  return createPortal(
    <div className="fixed inset-0 z-30">
      <div
        className="absolute inset-0 bg-black/50"
        style={{ opacity: 1 - Math.min(dragY / 500, 0.6) }}
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={name}
        className="absolute inset-x-0 bottom-0 z-40 flex max-h-[88dvh] flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-2xl dark:bg-stone-900"
        style={{ transform: `translateY(${dragY}px)`, transition: dragging ? 'none' : 'transform 0.2s ease-out' }}
      >
        {/* Drag handle: grabber + zaglavlje (povlačenje ovde zatvara; telo i dalje skroluje) */}
        <div
          className="shrink-0 cursor-grab touch-none active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-stone-300 dark:bg-stone-600" aria-hidden="true" />
          <div className="flex items-center justify-between px-4 py-2">
            <h2 className="truncate text-sm font-semibold text-stone-500 dark:text-stone-400">{name}</h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={STR.common.close}
              className="-mr-1 cursor-pointer rounded-md p-2 text-stone-500 hover:bg-stone-200/70 dark:hover:bg-stone-700/70"
            >
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto px-4 pb-4">
          {isPending ? (
            <FullScreenSpinner />
          ) : isError || !person ? (
            <p className="text-sm text-stone-500 dark:text-stone-400">{STR.person.notFound}</p>
          ) : (
            <PersonDetailContent
              person={person}
              onPersonClick={onFocusPerson}
              onShowInTree={onShowInTree}
              onDeleted={onClose}
            />
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
