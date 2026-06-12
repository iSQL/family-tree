import { useState } from 'react';
import type { UnionEndReason, UnionType, UnionWithPartner } from '@shared/types';
import { partialDateRegex } from '@shared/schemas';
import { useUpdateUnion } from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { Button } from '../ui/Button';
import { Dialog } from '../ui/Dialog';
import { Field, Input } from '../ui/Input';
import { Select } from '../ui/Select';
import { STR } from '../../lib/strings';

export interface UnionFormProps {
  open: boolean;
  onClose: () => void;
  union: UnionWithPartner;
}

function dateError(value: string): string | undefined {
  if (value.trim() === '') return undefined;
  return partialDateRegex.test(value.trim()) ? undefined : STR.person.datePlaceholder;
}

/** Mini-dialog za izmenu braka: tip, datum venčanja, kraj braka. */
export function UnionForm({ open, onClose, union }: UnionFormProps) {
  const online = useOnline();
  const update = useUpdateUnion();

  const [type, setType] = useState<UnionType>(union.type);
  const [startDate, setStartDate] = useState(union.start_date ?? '');
  const [endDate, setEndDate] = useState(union.end_date ?? '');
  const [endReason, setEndReason] = useState<UnionEndReason | ''>(union.end_reason ?? '');

  const startError = dateError(startDate);
  const endError = dateError(endDate);

  const submit = () => {
    if (startError || endError) return;
    update.mutate(
      {
        id: union.id,
        patch: {
          type,
          start_date: startDate.trim() === '' ? null : startDate.trim(),
          end_date: endDate.trim() === '' ? null : endDate.trim(),
          end_reason: endReason === '' ? null : endReason,
        },
      },
      { onSuccess: () => onClose() },
    );
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={STR.union.editTitle}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={update.isPending}>
            {STR.common.cancel}
          </Button>
          <Button
            onClick={submit}
            disabled={update.isPending || !online || Boolean(startError) || Boolean(endError)}
            title={!online ? STR.common.offlineDisabled : undefined}
          >
            {STR.common.save}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        <Field label={STR.union.type}>
          <Select value={type} onChange={(e) => setType(e.target.value as UnionType)}>
            <option value="marriage">{STR.union.typeMarriage}</option>
            <option value="partnership">{STR.union.typePartnership}</option>
          </Select>
        </Field>
        <Field label={STR.union.startDate} error={startError}>
          <Input
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            placeholder={STR.person.datePlaceholder}
            inputMode="numeric"
          />
        </Field>
        <Field label={STR.union.endDate} error={endError}>
          <Input
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            placeholder={STR.person.datePlaceholder}
            inputMode="numeric"
          />
        </Field>
        <Field label={STR.union.endReason}>
          <Select
            value={endReason}
            onChange={(e) => setEndReason(e.target.value as UnionEndReason | '')}
          >
            <option value="">{STR.union.endReasonNone}</option>
            <option value="divorce">{STR.union.endReasonDivorce}</option>
            <option value="death">{STR.union.endReasonDeath}</option>
            <option value="separation">{STR.union.endReasonSeparation}</option>
          </Select>
        </Field>
      </div>
    </Dialog>
  );
}
