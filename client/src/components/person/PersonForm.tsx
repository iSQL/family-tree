import { useState } from 'react';
import { Controller, useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Camera } from 'lucide-react';
import type { Gender, PersonSlim } from '@shared/types';
import { personInputSchema, type PersonInput } from '@shared/schemas';
import { useOnline } from '../../hooks/useOnline';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Field, Input, Textarea } from '../ui/Input';
import { Avatar } from './Avatar';
import { RelativePicker } from './RelativePicker';
import { PhotoUploadDialog } from '../photo/PhotoUploadDialog';
import { STR } from '../../lib/strings';

/** Sirove vrednosti forme — zod (personInputSchema) ih pretvara u PersonInput. */
export interface PersonFormValues {
  first_name: string;
  last_name: string;
  maiden_name: string;
  gender: Gender;
  title: string;
  birth_date: string;
  death_date: string;
  birth_place: string;
  notes: string;
  father_id: number | null;
  mother_id: number | null;
}

const EMPTY_VALUES: PersonFormValues = {
  first_name: '',
  last_name: '',
  maiden_name: '',
  gender: 'U',
  title: '',
  birth_date: '',
  death_date: '',
  birth_place: '',
  notes: '',
  father_id: null,
  mother_id: null,
};

// zod@4 preprocess polja imaju `unknown` input tip — kastujemo na naš ekvivalentan oblik.
const resolver = zodResolver(personInputSchema) as unknown as Resolver<
  PersonFormValues,
  unknown,
  PersonInput
>;

export interface PersonFormProps {
  defaultValues?: Partial<PersonFormValues>;
  /** Sve osobe (za izbor roditelja). */
  persons: PersonSlim[];
  /** Id osobe koja se menja (edit) — omogućava upload slike i isključuje sebe iz pickera. */
  personId?: number;
  photo?: { photo_id: string | null; person: PersonSlim } | undefined;
  submitting?: boolean;
  onSubmit: (values: PersonInput) => void;
  onCancel: () => void;
}

const GENDER_OPTIONS: { value: Gender; label: string }[] = [
  { value: 'M', label: STR.person.genderM },
  { value: 'F', label: STR.person.genderF },
  { value: 'U', label: STR.person.genderU },
];

export function PersonForm({
  defaultValues,
  persons,
  personId,
  photo,
  submitting = false,
  onSubmit,
  onCancel,
}: PersonFormProps) {
  const online = useOnline();
  const [photoDialogOpen, setPhotoDialogOpen] = useState(false);

  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<PersonFormValues, unknown, PersonInput>({
    resolver,
    defaultValues: { ...EMPTY_VALUES, ...defaultValues },
  });

  const excludeIds = personId !== undefined ? [personId] : [];
  const disabled = submitting || !online;

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={`${STR.person.firstName} *`} error={errors.first_name?.message}>
          <Input {...register('first_name')} autoComplete="off" />
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
        <legend className="mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
          {STR.person.gender}
        </legend>
        <div className="flex gap-4">
          {GENDER_OPTIONS.map((opt) => (
            <label key={opt.value} className="flex cursor-pointer items-center gap-1.5 text-sm">
              <input
                type="radio"
                value={opt.value}
                {...register('gender')}
                className="accent-amber-700 dark:accent-amber-500"
              />
              {opt.label}
            </label>
          ))}
        </div>
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

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <Field label={STR.person.father} error={errors.father_id?.message}>
          <Controller
            name="father_id"
            control={control}
            render={({ field }) => (
              <RelativePicker
                persons={persons}
                excludeIds={excludeIds}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
        <Field label={STR.person.mother} error={errors.mother_id?.message}>
          <Controller
            name="mother_id"
            control={control}
            render={({ field }) => (
              <RelativePicker
                persons={persons}
                excludeIds={excludeIds}
                value={field.value}
                onChange={field.onChange}
              />
            )}
          />
        </Field>
      </div>

      <Field label={STR.person.notes} error={errors.notes?.message}>
        <Textarea {...register('notes')} rows={4} />
      </Field>

      {/* Fotografija — samo za postojeću osobu (treba nam id za upload) */}
      <div>
        <span className="mb-1 block text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
          {STR.photo.dialogTitle}
        </span>
        {personId !== undefined && photo ? (
          <div className="flex items-center gap-3">
            <Avatar person={photo.person} size={56} />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setPhotoDialogOpen(true)}
              disabled={!online}
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              <Camera size={14} aria-hidden="true" />
              {photo.photo_id ? STR.photo.change : STR.photo.pick}
            </Button>
            <PhotoUploadDialog
              open={photoDialogOpen}
              onClose={() => setPhotoDialogOpen(false)}
              personId={personId}
              currentPhotoId={photo.photo_id}
            />
          </div>
        ) : (
          <p className="text-sm text-stone-500 dark:text-stone-400">{STR.photo.saveFirst}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 border-t border-stone-200 pt-4 dark:border-stone-700">
        <Button variant="secondary" onClick={onCancel} disabled={submitting}>
          {STR.common.cancel}
        </Button>
        <Button type="submit" disabled={disabled} title={!online ? STR.common.offlineDisabled : undefined}>
          {STR.common.save}
        </Button>
      </div>
    </form>
  );
}
