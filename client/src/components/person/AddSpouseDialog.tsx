import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UserPlus } from 'lucide-react';
import type { PersonSlim, UnionType } from '@shared/types';
import { partialDateRegex } from '@shared/schemas';
import { useCreateUnion } from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { useTree } from '../../hooks/useTree';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Dialog } from '../ui/Dialog';
import { Field } from '../ui/Input';
import { Select } from '../ui/Select';
import { RelativePicker } from './RelativePicker';
import { STR } from '../../lib/strings';

export interface AddSpouseDialogProps {
  open: boolean;
  onClose: () => void;
  person: PersonSlim;
  onSuccess?: () => void;
  /** Da li se nudi i unos nove osobe. Isključeno tamo odakle odlazak sa stranice gubi neupisane izmene. */
  allowNew?: boolean;
}

function dateError(value: string): string | undefined {
  if (value.trim() === '') return undefined;
  return partialDateRegex.test(value.trim()) ? undefined : STR.person.datePlaceholder;
}

export function AddSpouseDialog({
  open,
  onClose,
  person,
  onSuccess,
  allowNew = true,
}: AddSpouseDialogProps) {
  const navigate = useNavigate();
  const online = useOnline();
  const { data: tree } = useTree();
  const createUnion = useCreateUnion();

  const [tab, setTab] = useState<'existing' | 'new'>('existing');
  const [partnerId, setPartnerId] = useState<number | null>(null);
  const [type, setType] = useState<UnionType>('marriage');
  const [startDate, setStartDate] = useState('');

  const startError = dateError(startDate);

  // Isključi samu osobu i osobe sa kojima već ima aktivan brak (bez zabeleženog kraja).
  const excludeIds = useMemo(() => {
    const ids = [person.id];
    if (tree?.unions) {
      for (const u of tree.unions) {
        if (u.partner1_id === person.id && u.end_date === null && u.end_reason === null) {
          ids.push(u.partner2_id);
        } else if (u.partner2_id === person.id && u.end_date === null && u.end_reason === null) {
          ids.push(u.partner1_id);
        }
      }
    }
    return ids;
  }, [person.id, tree?.unions]);

  const handleLinkExisting = () => {
    if (partnerId === null || startError) return;
    createUnion.mutate(
      {
        partner1_id: person.id,
        partner2_id: partnerId,
        type,
        start_date: startDate.trim() === '' ? null : startDate.trim(),
      },
      {
        onSuccess: () => {
          onClose();
          onSuccess?.();
        },
      },
    );
  };

  const handleGoToNew = () => {
    onClose();
    navigate(`/person/new?spouseOf=${person.id}`);
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`${STR.union.addTitle}: ${person.first_name} ${person.last_name}`.trim()}
      footer={
        tab === 'existing' ? (
          <>
            <Button variant="secondary" onClick={onClose} disabled={createUnion.isPending}>
              {STR.common.cancel}
            </Button>
            <Button
              onClick={handleLinkExisting}
              disabled={
                partnerId === null ||
                createUnion.isPending ||
                !online ||
                Boolean(startError)
              }
              title={!online ? STR.common.offlineDisabled : undefined}
            >
              {STR.union.linkButton}
            </Button>
          </>
        ) : (
          <>
            <Button variant="secondary" onClick={onClose}>
              {STR.common.cancel}
            </Button>
            <Button onClick={handleGoToNew}>
              <UserPlus size={14} aria-hidden="true" />
              {STR.union.newPersonButton}
            </Button>
          </>
        )
      }
    >
      <div className="space-y-4">
        {/* Segmentirani izbor: Postojeća osoba vs Nova osoba */}
        {allowNew && (
          <div className="flex rounded-lg bg-surface2 p-1">
            <button
              type="button"
              aria-pressed={tab === 'existing'}
              onClick={() => setTab('existing')}
              className={`flex-1 cursor-pointer rounded-md py-1.5 text-center text-sm font-medium transition-colors ${
                tab === 'existing' ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {STR.union.existingPersonTab}
            </button>
            <button
              type="button"
              aria-pressed={tab === 'new'}
              onClick={() => setTab('new')}
              className={`flex-1 cursor-pointer rounded-md py-1.5 text-center text-sm font-medium transition-colors ${
                tab === 'new' ? 'bg-surface text-ink shadow-xs' : 'text-muted hover:text-ink'
              }`}
            >
              {STR.union.newPersonTab}
            </button>
          </div>
        )}

        {tab === 'existing' ? (
          <div className="space-y-3">
            <Field label={`${STR.union.partnerField} *`}>
              <RelativePicker
                persons={tree?.persons ?? []}
                excludeIds={excludeIds}
                value={partnerId}
                onChange={setPartnerId}
              />
            </Field>

            <Field label={STR.union.type}>
              <Select value={type} onChange={(e) => setType(e.target.value as UnionType)}>
                <option value="marriage">{STR.union.typeMarriage}</option>
                <option value="partnership">{STR.union.typePartnership}</option>
              </Select>
            </Field>

            <Field label={STR.union.startDate} error={startError}>
              <DateInput
                value={startDate}
                onChange={setStartDate}
                placeholder={STR.person.datePlaceholder}
                invalid={Boolean(startError)}
              />
            </Field>
          </div>
        ) : (
          <div className="rounded-xl border border-line bg-surface2/50 p-4 text-sm text-muted">
            <p>{STR.union.newPersonPrompt}</p>
          </div>
        )}
      </div>
    </Dialog>
  );
}
