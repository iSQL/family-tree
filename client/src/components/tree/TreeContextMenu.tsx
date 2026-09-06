/**
 * Kontekst meni nad karticom u stablu (desni klik / dugi pritisak) — po dizajnu
 * „Stablo — kontekst meni i skrivanje": dodavanja (sa kbd prečicama), pa skrivanje
 * grane, pa izmena. Pozicionira se fiksno na koordinate događaja, uklješten u
 * okvir ekrana; zatvara se na klik van menija, Escape ili izbor akcije.
 */
import { useLayoutEffect, useEffect, useRef, useState } from 'react';
import { EyeOff, Heart, Pencil, UserPlus, Baby, TreeDeciduous } from 'lucide-react';
import type { PersonSlim } from '@shared/types';
import { STR } from '../../lib/strings';

export interface TreeContextMenuProps {
  person: PersonSlim;
  /** Viewport (client) koordinate tačke otvaranja. */
  x: number;
  y: number;
  canWrite: boolean;
  /** Veličina grane koju bi skrivanje odnelo; null = osoba je zaštićena (glavna/predak). */
  branchCount: number | null;
  onClose: () => void;
  onEdit: (id: number) => void;
  onAddChild: (id: number) => void;
  onAddSpouse: (id: number) => void;
  onAddParent: (id: number) => void;
  onHide: (id: number) => void;
  onShowFromHere: (id: number) => void;
}

const ITEM_CLASS =
  'flex w-full cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-[7px] text-left text-base text-ink transition-colors hover:bg-activebg';
const KBD_CLASS =
  'ml-auto hidden rounded-[5px] border border-line bg-bg px-[5px] font-mono text-[11px] text-faint sm:inline-block';

export function TreeContextMenu({
  person,
  x,
  y,
  canWrite,
  branchCount,
  onClose,
  onEdit,
  onAddChild,
  onAddSpouse,
  onAddParent,
  onHide,
  onShowFromHere,
}: TreeContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: x, top: y });

  // Uklješti meni u okvir ekrana (npr. desni klik uz samu ivicu).
  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(x, window.innerWidth - width - pad)),
      top: Math.max(pad, Math.min(y, window.innerHeight - height - pad)),
    });
  }, [x, y]);

  // Zatvaranje: pritisak van menija, Escape, promena veličine prozora.
  useEffect(() => {
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('pointerdown', onPointerDown, true);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onClose);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown, true);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onClose);
    };
  }, [onClose]);

  const name = `${person.first_name} ${person.last_name}`.trim() || '?';
  const run = (action: (id: number) => void) => () => {
    onClose();
    action(person.id);
  };

  return (
    <div
      ref={menuRef}
      role="menu"
      aria-label={name}
      className="fixed z-50 flex min-w-[238px] flex-col rounded-xl border border-line bg-surface p-1 shadow-[0_16px_40px_-16px_rgba(20,30,50,.45)]"
      style={{ left: pos.left, top: pos.top }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="mb-1 truncate border-b border-line px-2.5 pt-1.5 pb-2 font-display text-sm text-heading">
        {name}
      </div>

      {canWrite && (
        <>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onAddChild)}>
            <Baby size={16} className="shrink-0 text-muted" aria-hidden="true" />
            {STR.person.addChild}
            <kbd className={KBD_CLASS}>z</kbd>
          </button>
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onAddSpouse)}>
            <Heart size={16} className="shrink-0 text-muted" aria-hidden="true" />
            {STR.person.addSpouse}
            <kbd className={KBD_CLASS}>x</kbd>
          </button>
          {(person.father_id === null || person.mother_id === null) && (
            <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onAddParent)}>
              <UserPlus size={16} className="shrink-0 text-muted" aria-hidden="true" />
              {STR.person.addParent}
            </button>
          )}
          <div className="mx-1.5 my-1 h-px bg-line" aria-hidden="true" />
        </>
      )}

      <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onShowFromHere)}>
        <TreeDeciduous size={16} className="shrink-0 text-muted" aria-hidden="true" />
        {STR.tree.showFromHere}
      </button>

      {branchCount !== null ? (
        <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onHide)}>
          <EyeOff size={16} className="shrink-0 text-muted" aria-hidden="true" />
          {STR.tree.hideBranch}
          <span className="ml-auto text-sm text-faint">+{branchCount}</span>
        </button>
      ) : (
        <span className="flex items-center gap-2.5 px-2.5 py-[7px] text-sm text-faint">
          {STR.tree.hideNote}
        </span>
      )}

      {canWrite && (
        <>
          <div className="mx-1.5 my-1 h-px bg-line" aria-hidden="true" />
          <button type="button" role="menuitem" className={ITEM_CLASS} onClick={run(onEdit)}>
            <Pencil size={16} className="shrink-0 text-muted" aria-hidden="true" />
            {STR.tree.editPerson}
          </button>
        </>
      )}
    </div>
  );
}
