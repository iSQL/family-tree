import { useEffect, useRef, useState } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  MONTHS_SR,
  formatPartialDateInput,
  parsePartialDate,
  parsePartialDateInput,
} from '@shared/partialDate';
import { STR } from '../../lib/strings';
import { FIELD_CLASSES } from './Input';

export interface DateInputProps {
  /** Parcijalni ISO datum ('GGGG' | 'GGGG-MM' | 'GGGG-MM-DD') ili ''. */
  value: string;
  /** Vraća parcijalni ISO datum, '' za prazno, ili sirovi tekst za nevalidan unos. */
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalid?: boolean;
  id?: string;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');

/**
 * Polje za unos parcijalnog datuma u evropskom formatu (DD.MM.GGGG / MM.GGGG / GGGG)
 * sa kalendarom za izbor punog datuma. Interno radi sa parcijalnim ISO datumom.
 */
export function DateInput({
  value,
  onChange,
  placeholder,
  disabled = false,
  invalid = false,
  id,
}: DateInputProps) {
  const [open, setOpen] = useState(false);
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState(() => formatPartialDateInput(value));
  const rootRef = useRef<HTMLDivElement>(null);

  // Resinhronizacija teksta iz value-a kad se ne kuca (reset forme, izbor iz kalendara…).
  // Za nevalidan, neprazan value zadržavamo sirov tekst da korisnik vidi grešku.
  useEffect(() => {
    if (!focused) setText(value ? formatPartialDateInput(value) || value : '');
  }, [value, focused]);

  const commitText = (raw: string) => {
    setText(raw);
    const trimmed = raw.trim();
    if (trimmed === '') {
      onChange('');
      return;
    }
    const iso = parsePartialDateInput(trimmed);
    onChange(iso ?? trimmed); // nevalidno → prosledi sirovo, zod prijavljuje grešku
  };

  const pickDay = (iso: string) => {
    setText(formatPartialDateInput(iso));
    onChange(iso);
    setOpen(false);
  };

  return (
    <div
      ref={rootRef}
      className="relative"
      onBlur={(e) => {
        if (rootRef.current && !rootRef.current.contains(e.relatedTarget as Node)) {
          setFocused(false);
          setOpen(false);
        }
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') setOpen(false);
      }}
    >
      <input
        id={id}
        value={text}
        disabled={disabled}
        inputMode="numeric"
        autoComplete="off"
        placeholder={placeholder}
        onFocus={() => setFocused(true)}
        onChange={(e) => commitText(e.target.value)}
        className={`${FIELD_CLASSES} pr-10 ${
          invalid ? 'border-red-500 focus:border-red-500 focus:ring-red-500/30 dark:border-red-500' : ''
        }`}
      />
      <button
        type="button"
        disabled={disabled}
        aria-label={STR.person.pickDate}
        onClick={() => setOpen((o) => !o)}
        className="absolute inset-y-0 right-0 flex items-center px-3 text-stone-400 hover:text-amber-700 disabled:opacity-50 dark:hover:text-amber-500"
      >
        <CalendarIcon size={16} aria-hidden="true" />
      </button>

      {open && !disabled && <Calendar value={value} onSelect={pickDay} />}
    </div>
  );
}

const WEEKDAYS = ['Pon', 'Uto', 'Sre', 'Čet', 'Pet', 'Sub', 'Ned'] as const;

const ARROW_CLASSES =
  'rounded-md p-1.5 text-stone-500 hover:bg-stone-100 hover:text-stone-800 dark:text-stone-400 dark:hover:bg-stone-800 dark:hover:text-stone-100';

function Calendar({ value, onSelect }: { value: string; onSelect: (iso: string) => void }) {
  const now = new Date();
  const sel = parsePartialDate(value);
  const [year, setYear] = useState(sel?.year ?? now.getFullYear());
  const [month, setMonth] = useState(sel?.month ?? now.getMonth() + 1); // 1-12

  const daysInMonth = new Date(year, month, 0).getDate();
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Pon=0 … Ned=6

  const prevMonth = () => {
    if (month === 1) {
      setMonth(12);
      setYear((y) => y - 1);
    } else setMonth((m) => m - 1);
  };
  const nextMonth = () => {
    if (month === 12) {
      setMonth(1);
      setYear((y) => y + 1);
    } else setMonth((m) => m + 1);
  };

  const cells: (number | null)[] = [];
  for (let i = 0; i < firstWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(d);

  const isSelected = (d: number) => sel?.year === year && sel?.month === month && sel?.day === d;
  const isToday = (d: number) =>
    now.getFullYear() === year && now.getMonth() + 1 === month && now.getDate() === d;

  return (
    <div className="absolute top-full left-0 z-40 mt-1 w-72 rounded-lg border border-stone-200 bg-white p-3 shadow-lg dark:border-stone-700 dark:bg-stone-900">
      <div className="mb-2 flex items-center gap-1">
        <button type="button" aria-label="Prethodni mesec" onMouseDown={(e) => e.preventDefault()} onClick={prevMonth} className={ARROW_CLASSES}>
          <ChevronLeft size={16} />
        </button>
        <select
          value={month}
          onChange={(e) => setMonth(Number(e.target.value))}
          className="flex-1 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm capitalize outline-none focus:border-amber-600 dark:border-stone-600 dark:bg-stone-800"
        >
          {MONTHS_SR.map((m, i) => (
            <option key={m} value={i + 1}>
              {m}
            </option>
          ))}
        </select>
        <input
          type="number"
          value={year}
          aria-label="Godina"
          onChange={(e) => setYear(Number(e.target.value) || year)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') e.preventDefault();
          }}
          className="w-20 rounded-md border border-stone-300 bg-white px-2 py-1 text-sm outline-none focus:border-amber-600 dark:border-stone-600 dark:bg-stone-800"
        />
        <button type="button" aria-label="Sledeći mesec" onMouseDown={(e) => e.preventDefault()} onClick={nextMonth} className={ARROW_CLASSES}>
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="grid grid-cols-7 gap-0.5 text-center text-xs font-medium text-stone-400">
        {WEEKDAYS.map((w) => (
          <div key={w} className="py-1">
            {w}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-0.5">
        {cells.map((d, i) =>
          d === null ? (
            <div key={`e${i}`} />
          ) : (
            <button
              key={d}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onSelect(`${String(year).padStart(4, '0')}-${pad2(month)}-${pad2(d)}`)}
              className={`rounded-md py-1.5 text-sm transition-colors ${
                isSelected(d)
                  ? 'bg-amber-600 text-white hover:bg-amber-600'
                  : isToday(d)
                    ? 'font-bold text-amber-700 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-amber-900/40'
                    : 'text-stone-700 hover:bg-amber-100 dark:text-stone-200 dark:hover:bg-amber-900/40'
              }`}
            >
              {d}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
