import { Dialog } from '../ui/Dialog';
import { STR } from '../../lib/strings';

const KBD = 'rounded-[5px] border border-line bg-bg px-1.5 font-mono text-xs text-ink';

const ROWS: { keys: string[]; label: string }[] = [
  { keys: ['D', 'Z'], label: STR.shortcuts.child },
  { keys: ['S', 'X'], label: STR.shortcuts.spouse },
  { keys: ['R'], label: STR.shortcuts.parents },
  { keys: ['B'], label: STR.shortcuts.sibling },
  { keys: ['E'], label: STR.shortcuts.edit },
  { keys: ['Ctrl+K'], label: STR.shortcuts.search },
  { keys: ['Esc'], label: STR.shortcuts.close },
  { keys: ['?'], label: STR.shortcuts.help },
];

/** Spisak prečica sa tastature (taster „?"). */
export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title={STR.shortcuts.title}>
      <p className="mb-3 text-sm text-muted">{STR.shortcuts.intro}</p>
      <dl className="divide-y divide-line">
        {ROWS.map((r) => (
          <div key={r.label} className="flex items-center justify-between gap-4 py-2">
            <dt className="text-base text-ink">{r.label}</dt>
            <dd className="flex items-center gap-1.5 text-xs text-faint">
              {r.keys.map((k, i) => (
                <span key={k} className="flex items-center gap-1.5">
                  {i > 0 && STR.shortcuts.alias}
                  <kbd className={KBD}>{k}</kbd>
                </span>
              ))}
            </dd>
          </div>
        ))}
      </dl>
    </Dialog>
  );
}
