import { useMemo, type ReactNode } from 'react';
import { Controller, useForm, useWatch, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { findPossibleDuplicates, personName } from '@shared/proposalCheck';
import { proposedPersonFieldsSchema, type ProposedPersonFields } from '@shared/schemas';
import type { Gender, PersonSlim, ProposedPerson } from '@shared/types';
import { formatLifespan } from '../../lib/dates';
import { STR } from '../../lib/strings';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Dialog } from '../ui/Dialog';
import { Field, Input, Textarea } from '../ui/Input';

/** Sirove vrednosti forme — zod (proposedPersonFieldsSchema) ih pretvara u ProposedPersonFields. */
export interface ProposedPersonFormValues {
  first_name: string;
  last_name: string;
  maiden_name: string;
  gender: Gender;
  title: string;
  birth_date: string;
  death_date: string;
  birth_place: string;
  notes: string;
}

export const EMPTY_PROPOSED_VALUES: ProposedPersonFormValues = {
  first_name: '',
  last_name: '',
  maiden_name: '',
  gender: 'U',
  title: '',
  birth_date: '',
  death_date: '',
  birth_place: '',
  notes: '',
};

/** Postojeća predložena osoba → vrednosti forme (za izmenu). */
export function proposedToFormValues(p: ProposedPerson): ProposedPersonFormValues {
  return {
    first_name: p.first_name,
    last_name: p.last_name,
    maiden_name: p.maiden_name ?? '',
    gender: p.gender,
    title: p.title ?? '',
    birth_date: p.birth_date ?? '',
    death_date: p.death_date ?? '',
    birth_place: p.birth_place ?? '',
    notes: p.notes ?? '',
  };
}

// zod@4 preprocess polja imaju `unknown` input tip — kastujemo na naš ekvivalentan oblik.
const resolver = zodResolver(proposedPersonFieldsSchema) as unknown as Resolver<
  ProposedPersonFormValues,
  unknown,
  ProposedPersonFields
>;

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'M', label: STR.person.genderM },
  { value: 'F', label: STR.person.genderF },
  { value: 'U', label: STR.person.genderU },
];

const FORM_ID = 'proposed-person-form';

export interface ProposedPersonDialogProps {
  title: string;
  defaultValues: ProposedPersonFormValues;
  /** Pol određen ulogom (otac/majka) — ne može da se menja. */
  lockedGender?: Gender | undefined;
  /** Osobe iz stabla — za upozorenje da nova osoba možda već postoji. */
  existingPersons: PersonSlim[];
  submitLabel: string;
  /** Dodatna polja iznad podataka osobe (npr. drugi roditelj). */
  children?: ReactNode;
  onSubmit: (values: ProposedPersonFields) => void;
  onClose: () => void;
}

/** Forma za novu (ili izmenu predložene) osobu u predlogu saradnika. */
export function ProposedPersonDialog({
  title,
  defaultValues,
  lockedGender,
  existingPersons,
  submitLabel,
  children,
  onSubmit,
  onClose,
}: ProposedPersonDialogProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<ProposedPersonFormValues, unknown, ProposedPersonFields>({ resolver, defaultValues });

  const [firstName, lastName, maidenName, birthDate, gender] = useWatch({
    control,
    name: ['first_name', 'last_name', 'maiden_name', 'birth_date', 'gender'],
  });
  const duplicates = useMemo(
    () =>
      findPossibleDuplicates(
        existingPersons,
        {
          first_name: firstName,
          last_name: lastName,
          maiden_name: maidenName || null,
          gender: lockedGender ?? gender,
          birth_date: birthDate || null,
        },
        3,
      ),
    [existingPersons, firstName, lastName, maidenName, birthDate, gender, lockedGender],
  );

  const submit = handleSubmit((values) => onSubmit(lockedGender ? { ...values, gender: lockedGender } : values));

  return (
    <Dialog
      open
      onClose={onClose}
      title={title}
      maxWidthClass="sm:max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            {STR.common.cancel}
          </Button>
          <Button type="submit" form={FORM_ID}>
            {submitLabel}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} className="space-y-4" noValidate>
        {children}

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={`${STR.person.firstName} *`} error={errors.first_name?.message}>
            <Input {...register('first_name')} autoComplete="off" autoFocus />
          </Field>
          <Field label={STR.person.lastName} error={errors.last_name?.message}>
            <Input {...register('last_name')} autoComplete="off" />
          </Field>
          <Field label={STR.person.maidenName} error={errors.maiden_name?.message}>
            <Input {...register('maiden_name')} autoComplete="off" />
          </Field>
          <Field label={STR.person.title} error={errors.title?.message}>
            <Input {...register('title')} placeholder={STR.person.titlePlaceholder} autoComplete="off" />
          </Field>
        </div>

        <fieldset>
          <legend className="zb-label mb-1 block text-[11px] tracking-[.16em] text-faint">{STR.person.gender}</legend>
          {lockedGender ? (
            <p className="text-sm text-ink">{GENDER_OPTIONS.find((o) => o.value === lockedGender)?.label}</p>
          ) : (
            <div className="flex gap-4">
              {GENDER_OPTIONS.map((opt) => (
                <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    value={opt.value}
                    {...register('gender')}
                    className="accent-[#1d3557] dark:accent-[#c29b47]"
                  />
                  {opt.label}
                </label>
              ))}
            </div>
          )}
        </fieldset>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label={STR.person.birthDate} error={errors.birth_date?.message}>
            <Controller
              name="birth_date"
              control={control}
              render={({ field }) => (
                <DateInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={STR.person.datePlaceholder}
                  invalid={Boolean(errors.birth_date)}
                />
              )}
            />
          </Field>
          <Field label={STR.person.deathDate} error={errors.death_date?.message}>
            <Controller
              name="death_date"
              control={control}
              render={({ field }) => (
                <DateInput
                  value={field.value}
                  onChange={field.onChange}
                  placeholder={STR.person.datePlaceholder}
                  invalid={Boolean(errors.death_date)}
                />
              )}
            />
          </Field>
        </div>

        <Field label={STR.person.birthPlace} error={errors.birth_place?.message}>
          <Input {...register('birth_place')} autoComplete="off" />
        </Field>

        <Field label={STR.person.notes} error={errors.notes?.message}>
          <Textarea {...register('notes')} rows={3} />
        </Field>

        {duplicates.length > 0 && (
          <div role="status" className="rounded-xl border border-line bg-activebg px-3 py-2 text-sm text-activefg">
            <p>
              {STR.contributor.duplicateHint}{' '}
              {duplicates
                .map((p) => {
                  const span = formatLifespan(p.birth_date, p.death_date);
                  return span ? `${personName(p)} (${span})` : personName(p);
                })
                .join(', ')}
            </p>
            <p className="mt-0.5 text-xs">{STR.contributor.duplicateAdvice}</p>
          </div>
        )}
      </form>
    </Dialog>
  );
}
