import type { ReactNode } from 'react';
import type { BranchChange, BranchChangesResponse } from '@shared/types';
import { formatPartialDate, formatTimestampDate } from '../../lib/dates';
import { STR } from '../../lib/strings';
import { Button } from '../ui/Button';
import { Card } from '../ui/Card';

/** merge: izbor mora sadržati i ono od čega izmena zavisi; discard: i ono što zavisi od nje. */
export type SelectionMode = 'merge' | 'discard';

function closure(changes: BranchChange[], start: Iterable<string>, next: (c: BranchChange) => string[]): Set<string> {
  const byKey = new Map(changes.map((c) => [c.key, c]));
  const out = new Set<string>();
  const stack = [...start];
  while (stack.length > 0) {
    const key = stack.pop()!;
    if (out.has(key)) continue;
    out.add(key);
    const change = byKey.get(key);
    if (change) stack.push(...next(change));
  }
  return out;
}

export const withDependencies = (changes: BranchChange[], keys: Iterable<string>) =>
  closure(changes, keys, (c) => c.depends_on);

export const withDependents = (changes: BranchChange[], keys: Iterable<string>) =>
  closure(changes, keys, (c) => changes.filter((o) => o.depends_on.includes(c.key)).map((o) => o.key));

/** Uključi/isključi izmenu zajedno sa izmenama bez kojih izbor ne bi bio ispravan. */
export function toggleSelection(
  changes: BranchChange[],
  selected: Set<string>,
  key: string,
  checked: boolean,
  mode: SelectionMode,
): Set<string> {
  const next = new Set(selected);
  if (checked) {
    for (const k of (mode === 'merge' ? withDependencies : withDependents)(changes, [key])) next.add(k);
  } else {
    for (const k of (mode === 'merge' ? withDependents : withDependencies)(changes, [key])) next.delete(k);
  }
  return next;
}

const ACTION_LABELS: Record<string, string> = {
  'person:create': STR.branch.actionPersonCreate,
  'person:update': STR.branch.actionPersonUpdate,
  'person:delete': STR.branch.actionPersonDelete,
  'union:create': STR.branch.actionUnionCreate,
  'union:update': STR.branch.actionUnionUpdate,
  'union:delete': STR.branch.actionUnionDelete,
};

const ACTION_STYLES: Record<BranchChange['action'], string> = {
  create: 'bg-navy text-onnav',
  update: 'bg-surface2 text-heading',
  delete: 'bg-surface2 text-danger',
};

const FIELD_LABELS: Record<string, string> = {
  first_name: STR.person.firstName,
  last_name: STR.person.lastName,
  maiden_name: STR.person.maidenName,
  gender: STR.person.gender,
  title: STR.person.title,
  birth_date: STR.person.birthDate,
  death_date: STR.person.deathDate,
  birth_place: STR.person.birthPlace,
  notes: STR.person.notes,
  father_id: STR.person.father,
  mother_id: STR.person.mother,
  is_family_head: STR.branch.familyHead,
  photo_id: STR.photo.dialogTitle,
  partner1_id: STR.branch.partner,
  partner2_id: STR.branch.partner,
  type: STR.union.type,
  start_date: STR.union.startDate,
  end_date: STR.union.endDate,
  end_reason: STR.union.endReason,
};

const DATE_FIELDS = new Set(['birth_date', 'death_date', 'start_date', 'end_date']);
const REF_FIELDS = new Set(['father_id', 'mother_id', 'partner1_id', 'partner2_id']);

function FieldValue({ field, value, labels }: { field: string; value: unknown; labels: Record<string, string> }) {
  if (value === null || value === undefined || value === '') return <span className="text-faint">—</span>;
  const text = String(value);
  if (DATE_FIELDS.has(field)) return <>{formatPartialDate(text) || text}</>;
  if (REF_FIELDS.has(field)) return <>{labels[text] ?? `#${text}`}</>;
  if (field === 'photo_id') {
    return (
      <img
        src={`/api/photos/${encodeURIComponent(text)}?size=thumb`}
        alt=""
        className="h-10 w-10 rounded-full object-cover"
      />
    );
  }
  if (field === 'gender') {
    return <>{value === 'M' ? STR.person.genderM : value === 'F' ? STR.person.genderF : STR.person.genderU}</>;
  }
  if (field === 'is_family_head') return <>{value ? STR.branch.yes : STR.branch.no}</>;
  if (field === 'type') return <>{value === 'marriage' ? STR.union.typeMarriage : STR.union.typePartnership}</>;
  if (field === 'end_reason') {
    return (
      <>
        {value === 'divorce'
          ? STR.union.endReasonDivorce
          : value === 'death'
            ? STR.union.endReasonDeath
            : STR.union.endReasonSeparation}
      </>
    );
  }
  return <span className="whitespace-pre-line">{text}</span>;
}

export function SelectionBar({
  total,
  selected,
  onSelectAll,
  onSelectNone,
  children,
}: {
  total: number;
  selected: number;
  onSelectAll: () => void;
  onSelectNone: () => void;
  children: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2">
      <div className="flex flex-wrap items-center gap-1.5 text-sm text-muted">
        <span>
          {selected} / {total} {STR.proposals.selectedCount}
        </span>
        <Button variant="ghost" size="sm" onClick={onSelectAll}>
          {STR.proposals.selectAll}
        </Button>
        <Button variant="ghost" size="sm" onClick={onSelectNone}>
          {STR.proposals.selectNone}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">{children}</div>
    </div>
  );
}

export interface BranchChangeListProps {
  data: BranchChangesResponse;
  selected: Set<string>;
  onToggle: (key: string, checked: boolean) => void;
}

/** Izmene grane kao diff: nova osoba/brak (vrednosti), izmena (bilo → postaje), brisanje. */
export function BranchChangeList({ data, selected, onToggle }: BranchChangeListProps) {
  const labelOf = (key: string) => data.changes.find((c) => c.key === key)?.label ?? key;

  return (
    <ul className="space-y-2">
      {data.changes.map((c) => {
        const actionLabel = ACTION_LABELS[`${c.entity}:${c.action}`] ?? c.action;
        const isUpdate = c.action === 'update';
        return (
          <li key={c.key}>
            <Card>
              <div className="flex gap-3 p-3.5">
                <input
                  type="checkbox"
                  checked={selected.has(c.key)}
                  onChange={(e) => onToggle(c.key, e.target.checked)}
                  aria-label={`${actionLabel}: ${c.label}`}
                  className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-[#1d3557] dark:accent-[#c29b47]"
                />
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`zb-label rounded-full px-2 py-0.5 text-[10px] tracking-[.12em] ${ACTION_STYLES[c.action]}`}>
                      {actionLabel}
                    </span>
                    <span className="font-medium text-heading">{c.label}</span>
                    {c.status !== 'ok' && (
                      <span
                        className={`zb-label rounded-full px-2 py-0.5 text-[10px] tracking-[.12em] ${
                          c.status === 'broken' ? 'bg-surface2 text-danger' : 'bg-activebg text-activefg'
                        }`}
                      >
                        {c.status === 'broken' ? STR.branch.statusBroken : STR.branch.statusConflict}
                      </span>
                    )}
                  </div>

                  {c.fields.length > 0 && (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="zb-label text-left text-[10px] tracking-[.12em] text-faint">
                            <th className="py-1 pr-3 font-normal">{STR.branch.colField}</th>
                            {isUpdate && <th className="py-1 pr-3 font-normal">{STR.branch.colBefore}</th>}
                            <th className="py-1 font-normal">{isUpdate ? STR.branch.colAfter : STR.branch.colValue}</th>
                          </tr>
                        </thead>
                        <tbody>
                          {c.fields.map((f) => (
                            <tr key={f.field} className="border-t border-line align-top">
                              <td className="py-1.5 pr-3 text-muted">{FIELD_LABELS[f.field] ?? f.field}</td>
                              {isUpdate && (
                                <td className="py-1.5 pr-3 text-muted">
                                  <FieldValue field={f.field} value={f.from} labels={data.person_labels} />
                                  {f.conflict && (
                                    <div className="mt-0.5 text-xs text-activefg">
                                      {STR.branch.nowInTree}:{' '}
                                      <FieldValue field={f.field} value={f.current} labels={data.person_labels} />
                                    </div>
                                  )}
                                </td>
                              )}
                              <td className="py-1.5 text-ink">
                                <FieldValue field={f.field} value={f.to} labels={data.person_labels} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}

                  {c.problems.map((p) => (
                    <p key={p} className={`text-sm ${c.status === 'broken' ? 'text-danger' : 'text-activefg'}`}>
                      {p}
                    </p>
                  ))}
                  {c.warnings.map((w) => (
                    <p key={w} className="text-sm text-activefg">
                      {w}
                    </p>
                  ))}
                  {c.depends_on.length > 0 && (
                    <p className="text-xs text-muted">
                      {STR.branch.dependsOn}: {c.depends_on.map(labelOf).join(', ')}
                    </p>
                  )}
                  <p className="text-xs text-faint">
                    {c.authors.join(', ')} · {formatTimestampDate(c.updated_at)}
                  </p>
                </div>
              </div>
            </Card>
          </li>
        );
      })}
    </ul>
  );
}
