/**
 * Meni plutajućeg dugmeta „Dodaj osobu" — pita „Kome?": podrazumevano dodaje uz
 * izabranu/glavnu osobu, a nepovezana osoba je sekundarna opcija.
 */
import { useEffect, useRef } from 'react';
import { Baby, Heart, UserPlus, UserRound, Users } from 'lucide-react';
import type { PersonSlim } from '@shared/types';
import type { CardAddKind } from './TreeCanvas';
import { STR } from '../../lib/strings';

export interface AddMenuProps {
  anchor: PersonSlim;
  /** Pravougaonik dugmeta koje otvara meni (meni se otvara iznad njega). */
  from: DOMRect;
  onPick: (kind: CardAddKind) => void;
  onUnlinked: () => void;
  onClose: () => void;
}

const ITEM_CLASS =
  'flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 text-left text-base text-ink transition-colors hover:bg-activebg';

export function AddMenu({ anchor, from, onPick, onUnlinked, onClose }: AddMenuProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onClose);
    ref.current?.querySelector<HTMLButtonElement>('button')?.focus();
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const name = `${anchor.first_name} ${anchor.last_name}`.trim() || '?';
  const hasParent = anchor.father_id !== null || anchor.mother_id !== null;
  const missingParent = anchor.father_id === null || anchor.mother_id === null;
  const pick = (kind: CardAddKind) => () => {
    onClose();
    onPick(kind);
  };

  return (
    <div
      ref={ref}
      role="menu"
      aria-label={STR.tree.addPerson}
      className="fixed z-50 flex w-[260px] flex-col rounded-xl border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(20,30,50,.45)]"
      style={{ left: Math.max(8, from.left), bottom: window.innerHeight - from.top + 8 }}
    >
      <div className="mb-1 border-b border-line px-2.5 pt-1.5 pb-2">
        <span className="zb-label block text-[10px] tracking-[.16em] text-faint">{STR.quickAdd.addFor}</span>
        <span className="block truncate font-display text-sm text-heading">{name}</span>
      </div>
      <button type="button" role="menuitem" className={ITEM_CLASS} onClick={pick('child')}>
        <Baby size={16} className="shrink-0 text-muted" aria-hidden="true" />
        {STR.person.addChild}
      </button>
      <button type="button" role="menuitem" className={ITEM_CLASS} onClick={pick('spouse')}>
        <Heart size={16} className="shrink-0 text-muted" aria-hidden="true" />
        {STR.person.addSpouse}
      </button>
      {missingParent && (
        <button type="button" role="menuitem" className={ITEM_CLASS} onClick={pick('parents')}>
          <UserPlus size={16} className="shrink-0 text-muted" aria-hidden="true" />
          {STR.tree.addParents}
        </button>
      )}
      {hasParent && (
        <button type="button" role="menuitem" className={ITEM_CLASS} onClick={pick('sibling')}>
          <Users size={16} className="shrink-0 text-muted" aria-hidden="true" />
          {STR.tree.addSibling}
        </button>
      )}
      <div className="mx-1.5 my-1 h-px bg-line" aria-hidden="true" />
      <button
        type="button"
        role="menuitem"
        className={ITEM_CLASS}
        onClick={() => {
          onClose();
          onUnlinked();
        }}
      >
        <UserRound size={16} className="shrink-0 text-muted" aria-hidden="true" />
        <span className="text-muted">{STR.quickAdd.unlinked}</span>
      </button>
    </div>
  );
}
