/**
 * Polja nove osobe u brzom unosu — skraćena forma (ime, prezime, pol, rođenje) sa
 * „Još polja" za ostalo, izborom fotografije i upozorenjem na moguće duplikate.
 * Stanje je kontrolisano (Draft), validacija ide kroz istu zod šemu kao server.
 */
import { useEffect, useMemo, useState } from 'react';
import { Camera, X } from 'lucide-react';
import type { Gender, PersonSlim } from '@shared/types';
import { personInputSchema, type PersonInput } from '@shared/schemas';
import { findPossibleDuplicates } from '@shared/duplicates';
import { formatLifespan } from '../../lib/dates';
import { DateInput } from '../ui/DateInput';
import { Field, Input, Textarea } from '../ui/Input';
import { Avatar } from '../person/Avatar';
import { STR } from '../../lib/strings';

export interface Draft {
  first_name: string;
  last_name: string;
  maiden_name: string;
  gender: Gender;
  birth_date: string;
  death_date: string;
  birth_place: string;
  title: string;
  notes: string;
  photo: File | null;
}

export function emptyDraft(over: Partial<Draft> = {}): Draft {
  return {
    first_name: '',
    last_name: '',
    maiden_name: '',
    gender: 'U',
    birth_date: '',
    death_date: '',
    birth_place: '',
    title: '',
    notes: '',
    photo: null,
    ...over,
  };
}

export type DraftErrors = Partial<Record<keyof Draft, string>>;

/** Validira nacrt kroz personInputSchema; roditelji se prosleđuju posebno. */
export function validateDraft(
  d: Draft,
  parents: { father_id: number | null; mother_id: number | null },
): { input: PersonInput; errors?: undefined } | { input?: undefined; errors: DraftErrors } {
  const res = personInputSchema.safeParse({
    first_name: d.first_name,
    last_name: d.last_name,
    maiden_name: d.maiden_name,
    gender: d.gender,
    title: d.title,
    birth_date: d.birth_date,
    death_date: d.death_date,
    birth_place: d.birth_place,
    notes: d.notes,
    ...parents,
  });
  if (res.success) return { input: res.data };
  const errors: DraftErrors = {};
  for (const issue of res.error.issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !(key in errors)) errors[key as keyof Draft] = issue.message;
  }
  return { errors };
}

const GENDERS: { value: Gender; label: string }[] = [
  { value: 'M', label: STR.person.genderM },
  { value: 'F', label: STR.person.genderF },
  { value: 'U', label: STR.person.genderU },
];

/** Segmentirani izbor (dva ili više dugmeta) — zajednički za pol, tabove i liniju. */
export function Segmented<T extends string>({
  value,
  options,
  onChange,
  label,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (v: T) => void;
  label: string;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg bg-surface2 p-1">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={`min-h-9 flex-1 cursor-pointer rounded-md px-2 py-1.5 text-center text-sm transition-colors ${
            value === o.value ? 'bg-surface font-semibold text-ink shadow-xs' : 'text-muted hover:text-ink'
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function PhotoPicker({ file, onChange }: { file: File | null; onChange: (f: File | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return (
    <div className="flex items-center gap-2">
      {preview ? (
        <>
          <img src={preview} alt="" className="h-10 w-10 rounded-full object-cover" />
          <button
            type="button"
            onClick={() => onChange(null)}
            aria-label={STR.quickAdd.photoRemove}
            className="cursor-pointer rounded-md p-2 text-faint hover:bg-surface2 hover:text-ink"
          >
            <X size={16} />
          </button>
        </>
      ) : (
        <label className="inline-flex min-h-10 cursor-pointer items-center gap-1.5 rounded-[9px] border border-dashed border-goldd px-3 text-sm font-semibold text-activefg hover:bg-activebg">
          <Camera size={16} aria-hidden="true" />
          {STR.quickAdd.photo}
          <input
            type="file"
            accept="image/*"
            className="sr-only"
            onChange={(e) => onChange(e.target.files?.[0] ?? null)}
          />
        </label>
      )}
    </div>
  );
}

export interface PersonDraftFieldsProps {
  draft: Draft;
  onChange: (patch: Partial<Draft>) => void;
  errors: DraftErrors;
  /** Pol je zadat odnosom (otac/majka) — bez izbora pola. */
  fixedGender?: boolean;
  /** Pomoćni tekst ispod prezimena (npr. „preuzeto od roditelja"). */
  surnameHint?: string | undefined;
  /** Fokusiraj ime pri prikazu. */
  autoFocus?: boolean;
}

export function PersonDraftFields({
  draft,
  onChange,
  errors,
  fixedGender = false,
  surnameHint,
  autoFocus = false,
}: PersonDraftFieldsProps) {
  const [more, setMore] = useState(false);
  // Devojačko prezime je bitno za žene; kod ostalih je u „Još polja".
  const maidenUpfront = draft.gender === 'F';

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label={`${STR.person.firstName} *`} error={errors.first_name}>
          <Input
            value={draft.first_name}
            onChange={(e) => onChange({ first_name: e.target.value })}
            autoComplete="off"
            autoFocus={autoFocus}
          />
        </Field>
        <Field label={STR.person.lastName} error={errors.last_name}>
          <Input
            value={draft.last_name}
            onChange={(e) => onChange({ last_name: e.target.value })}
            autoComplete="off"
          />
          {surnameHint && <span className="mt-0.5 block text-xs text-muted">{surnameHint}</span>}
        </Field>
      </div>

      {maidenUpfront && (
        <Field label={STR.quickAdd.maidenOptional} error={errors.maiden_name}>
          <Input
            value={draft.maiden_name}
            onChange={(e) => onChange({ maiden_name: e.target.value })}
            autoComplete="off"
          />
        </Field>
      )}

      <div className={`grid gap-3 ${fixedGender ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-[auto_1fr]'}`}>
        {!fixedGender && (
          <div>
            <span className="zb-label mb-1 block text-[11px] tracking-[.16em] text-faint">{STR.person.gender}</span>
            <Segmented
              label={STR.person.gender}
              value={draft.gender}
              options={GENDERS}
              onChange={(gender) => onChange({ gender })}
            />
          </div>
        )}
        <Field label={STR.person.birthDate} error={errors.birth_date}>
          <DateInput
            value={draft.birth_date}
            onChange={(birth_date) => onChange({ birth_date })}
            placeholder={STR.person.datePlaceholder}
            invalid={Boolean(errors.birth_date)}
          />
        </Field>
      </div>

      {more && (
        <div className="space-y-3">
          {!maidenUpfront && (
            <Field label={STR.person.maidenName} error={errors.maiden_name}>
              <Input
                value={draft.maiden_name}
                onChange={(e) => onChange({ maiden_name: e.target.value })}
                autoComplete="off"
              />
            </Field>
          )}
          <div className="grid grid-cols-2 gap-3">
            <Field label={STR.person.birthPlace} error={errors.birth_place}>
              <Input
                value={draft.birth_place}
                onChange={(e) => onChange({ birth_place: e.target.value })}
                autoComplete="off"
              />
            </Field>
            <Field label={STR.person.deathDate} error={errors.death_date}>
              <DateInput
                value={draft.death_date}
                onChange={(death_date) => onChange({ death_date })}
                placeholder={STR.person.datePlaceholder}
                invalid={Boolean(errors.death_date)}
              />
            </Field>
          </div>
          <Field label={STR.person.title} error={errors.title}>
            <Input
              value={draft.title}
              onChange={(e) => onChange({ title: e.target.value })}
              placeholder={STR.person.titlePlaceholder}
              autoComplete="off"
            />
          </Field>
          <Field label={STR.person.notes} error={errors.notes}>
            <Textarea value={draft.notes} onChange={(e) => onChange({ notes: e.target.value })} rows={3} />
          </Field>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <PhotoPicker file={draft.photo} onChange={(photo) => onChange({ photo })} />
        <button
          type="button"
          onClick={() => setMore((m) => !m)}
          aria-expanded={more}
          className="min-h-10 cursor-pointer px-1 text-sm font-semibold text-heading underline underline-offset-2"
        >
          {more ? STR.quickAdd.lessFields : STR.quickAdd.moreFields}
        </button>
      </div>
    </div>
  );
}

/** Upozorenje „Možda već postoji" — dok se kuca, sa prečicom ka povezivanju postojeće osobe. */
export function DuplicateHint({
  draft,
  persons,
  excludeIds,
  onLink,
}: {
  draft: Draft;
  persons: PersonSlim[];
  excludeIds: readonly number[];
  onLink: (id: number) => void;
}) {
  const [dismissed, setDismissed] = useState<number[]>([]);
  const matches = useMemo(() => {
    if (draft.first_name.trim().length < 2) return [];
    return findPossibleDuplicates(
      persons.filter((p) => !excludeIds.includes(p.id) && !dismissed.includes(p.id)),
      {
        first_name: draft.first_name,
        last_name: draft.last_name,
        maiden_name: draft.maiden_name.trim() === '' ? null : draft.maiden_name,
        gender: draft.gender,
        birth_date: /^\d{4}/.test(draft.birth_date) ? draft.birth_date : null,
      },
      3,
    );
  }, [draft.first_name, draft.last_name, draft.maiden_name, draft.gender, draft.birth_date, persons, excludeIds, dismissed]);

  if (matches.length === 0) return null;
  return (
    <div role="status" className="space-y-2 rounded-xl border border-[#e0cc9f] bg-activebg p-3 dark:border-line">
      <p className="text-sm font-semibold text-activefg">{STR.quickAdd.duplicateTitle}</p>
      <ul className="space-y-1.5">
        {matches.map((p) => {
          const years = formatLifespan(p.birth_date, p.death_date);
          return (
            <li key={p.id} className="flex flex-wrap items-center gap-2">
              <Avatar person={p} size={26} />
              <span className="min-w-0 flex-1 truncate text-sm text-ink">
                {p.first_name} {p.last_name}
                {years && <span className="ml-1 text-muted">{years}</span>}
              </span>
              <button
                type="button"
                onClick={() => onLink(p.id)}
                className="zb-label min-h-9 cursor-pointer rounded-lg bg-navy px-2.5 text-[11px] text-onnav hover:bg-navy2"
              >
                {STR.quickAdd.duplicateLink}
              </button>
              <button
                type="button"
                onClick={() => setDismissed((d) => [...d, p.id])}
                className="zb-label min-h-9 cursor-pointer rounded-lg border border-line px-2.5 text-[11px] text-ink hover:bg-surface2"
              >
                {STR.quickAdd.duplicateDismiss}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
