import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import type { PersonSlim } from '@shared/types';
import { foldForSearch, personMatchesQuery } from '@shared/search';
import { useTree } from '../../hooks/useTree';
import { formatLifespan } from '../../lib/dates';
import { Avatar } from '../person/Avatar';
import { STR } from '../../lib/strings';

const MAX_RESULTS = 8;

function rankResults(persons: PersonSlim[], query: string): PersonSlim[] {
  const matched = persons.filter((p) => personMatchesQuery(p, query));
  const folded = foldForSearch(query);
  // Pogoci čije foldovano ime počinje upitom idu prvi.
  const starts: PersonSlim[] = [];
  const rest: PersonSlim[] = [];
  for (const p of matched) {
    const name = foldForSearch(`${p.first_name} ${p.last_name}`);
    (name.startsWith(folded) ? starts : rest).push(p);
  }
  return [...starts, ...rest].slice(0, MAX_RESULTS);
}

/** Klijentska pretraga nad kešom stabla; izbor centrira osobu (?focus=). */
export function SearchBar() {
  const { data: tree } = useTree();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  const results = useMemo(() => {
    if (!tree || query.trim() === '') return [];
    return rankResults(tree.persons, query);
  }, [tree, query]);

  const select = (id: number) => {
    setQuery('');
    setOpen(false);
    inputRef.current?.blur();
    navigate(`/?focus=${id}`);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!open || results.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((i) => (i + 1) % results.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((i) => (i - 1 + results.length) % results.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const hit = results[activeIndex] ?? results[0];
      if (hit) select(hit.id);
    }
  };

  return (
    <div className="relative">
      <Search
        size={16}
        aria-hidden="true"
        className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-faint"
      />
      <input
        ref={inputRef}
        type="search"
        role="combobox"
        aria-expanded={open && results.length > 0}
        aria-label={STR.search.placeholder}
        placeholder={STR.search.placeholder}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
          setActiveIndex(0);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        onKeyDown={onKeyDown}
        className="w-full rounded-[9px] border border-line bg-bg py-2 pr-3 pl-8 text-base text-ink placeholder:text-faint outline-none focus:border-gold focus:ring-2 focus:ring-gold/30 sm:py-1.5"
      />
      {open && query.trim() !== '' && (
        <ul className="absolute top-full right-0 left-0 z-40 mt-1 max-h-80 overflow-y-auto rounded-xl border border-line bg-surface py-1 shadow-[0_16px_40px_-16px_rgba(20,30,50,.45)]">
          {results.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">{STR.search.noResults}</li>
          ) : (
            results.map((p, i) => {
              const years = formatLifespan(p.birth_date, p.death_date);
              return (
                <li key={p.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      select(p.id);
                    }}
                    onMouseEnter={() => setActiveIndex(i)}
                    className={`flex w-full cursor-pointer items-center gap-2.5 px-3 py-1.5 text-left text-sm ${
                      i === activeIndex ? 'bg-activebg' : ''
                    }`}
                  >
                    <Avatar person={p} size={28} />
                    <span className="min-w-0">
                      <span className="block truncate font-medium">
                        {p.first_name} {p.last_name}
                      </span>
                      {years && (
                        <span className="block text-xs text-muted">{years}</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })
          )}
        </ul>
      )}
    </div>
  );
}
