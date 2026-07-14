import { useMemo, useRef, useState } from 'react';
import { ChevronDown, X } from 'lucide-react';
import type { PersonSlim } from '@shared/types';
import { personMatchesQuery } from '@shared/search';
import { formatLifespan } from '../../lib/dates';
import { Avatar } from './Avatar';
import { STR } from '../../lib/strings';

export interface RelativePickerProps {
  persons: PersonSlim[];
  value: number | null;
  onChange: (id: number | null) => void;
  /** Osobe koje ne smeju da se ponude (npr. sama osoba). */
  excludeIds?: number[];
  placeholder?: string;
  disabled?: boolean;
}

/** Pretraživi izbor osobe iz stabla, sa opcijom '— niko —'. */
export function RelativePicker({
  persons,
  value,
  onChange,
  excludeIds = [],
  placeholder = STR.common.none,
  disabled = false,
}: RelativePickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  const selected = value === null ? null : (persons.find((p) => p.id === value) ?? null);

  const candidates = useMemo(() => {
    const pool = persons.filter((p) => !excludeIds.includes(p.id));
    const filtered = query.trim() === '' ? pool : pool.filter((p) => personMatchesQuery(p, query));
    return filtered.slice(0, 50);
  }, [persons, excludeIds, query]);

  const close = () => {
    setOpen(false);
    setQuery('');
  };

  const pick = (id: number | null) => {
    onChange(id);
    close();
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node)) close();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') close();
      }}
    >
      <button
        type="button"
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full cursor-pointer items-center gap-2 rounded-[9px] border border-line bg-bg px-3 py-2 text-left text-base text-ink outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 disabled:opacity-50"
      >
        {selected ? (
          <>
            <Avatar person={selected} size={22} />
            <span className="min-w-0 flex-1 truncate">
              {selected.first_name} {selected.last_name}
            </span>
            <span
              role="button"
              aria-label={STR.common.delete}
              onClick={(e) => {
                e.stopPropagation();
                pick(null);
              }}
              className="rounded p-1.5 text-faint hover:text-ink"
            >
              <X size={14} />
            </span>
          </>
        ) : (
          <span className="flex-1 text-faint">{placeholder}</span>
        )}
        <ChevronDown size={16} className="shrink-0 text-faint" aria-hidden="true" />
      </button>

      {open && (
        <div className="absolute top-full right-0 left-0 z-40 mt-1 rounded-xl border border-line bg-surface shadow-[0_16px_40px_-16px_rgba(20,30,50,.45)]">
          <div className="border-b border-line p-2">
            <input
              autoFocus
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={STR.person.pickerSearch}
              className="w-full rounded-md border border-line bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-gold"
            />
          </div>
          <ul className="max-h-56 overflow-y-auto py-1">
            <li>
              <button
                type="button"
                onMouseDown={(e) => {
                  e.preventDefault();
                  pick(null);
                }}
                className="w-full cursor-pointer px-3 py-1.5 text-left text-sm text-muted hover:bg-surface2"
              >
                {STR.common.none}
              </button>
            </li>
            {candidates.length === 0 && (
              <li className="px-3 py-2 text-sm text-faint">{STR.search.noResults}</li>
            )}
            {candidates.map((p) => {
              const years = formatLifespan(p.birth_date, p.death_date);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      pick(p.id);
                    }}
                    className={`flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-ink hover:bg-surface2 ${
                      p.id === value ? 'bg-activebg' : ''
                    }`}
                  >
                    <Avatar person={p} size={22} />
                    <span className="min-w-0 flex-1 truncate">
                      {p.first_name} {p.last_name}
                    </span>
                    {years && <span className="shrink-0 text-xs text-faint">{years}</span>}
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
