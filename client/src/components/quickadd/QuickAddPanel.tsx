/**
 * Brzi unos srodnika bez napuštanja stabla (Predlog 2): panel na mestu detalja
 * (desno na desktopu, bottom sheet na telefonu). Za dete, supružnika, roditelje
 * i brata/sestru nudi „Nova osoba" ili „Postojeća osoba"; sve što jedan unos
 * upisuje (osobe, veze, brak) izvršava se kao jedan plan koji može da se poništi.
 */
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import type { PersonSlim, TreeResponse, UnionType } from '@shared/types';
import { partialDateRegex } from '@shared/schemas';
import {
  assignParentSlots,
  inheritedSurname,
  missingParentSlots,
  oppositeGender,
  partnersOf,
  siblingLines,
  siblingParentSlots,
  type ParentSlots,
  type SiblingLine,
} from '@shared/quickAdd';
import { useApplyPlan, type ChangePlan, type PlanRef, type UndoStep } from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { centerCropToBlob } from '../../lib/imageCrop';
import { Button } from '../ui/Button';
import { DateInput } from '../ui/DateInput';
import { Field } from '../ui/Input';
import { Select } from '../ui/Select';
import { Avatar } from '../person/Avatar';
import { RelativePicker } from '../person/RelativePicker';
import {
  DuplicateHint,
  PersonDraftFields,
  Segmented,
  emptyDraft,
  validateDraft,
  type Draft,
  type DraftErrors,
} from './PersonDraftFields';
import { STR } from '../../lib/strings';

export type QuickAddKind = 'child' | 'spouse' | 'parents' | 'sibling' | 'free';

export interface QuickAddRequest {
  kind: QuickAddKind;
  /** Osoba kojoj se dodaje srodnik; null samo za 'free'. */
  anchorId: number | null;
  /** Vodič „Počni od sebe" — broj koraka i naslov koraka. */
  wizard?: { step: number; total: number; title: string };
}

export interface QuickAddSaved {
  request: QuickAddRequest;
  /** Osoba koja se ističe i otvara posle unosa (nova ili povezana). */
  primaryId: number;
  /** Sve nove ili povezane osobe — za isticanje u stablu. */
  ids: number[];
  label: string;
  /** Napravljena bar jedna nova osoba (inače je samo povezana postojeća). */
  created: boolean;
  undo: UndoStep[];
  /** „Sačuvaj i dodaj još" — panel ostaje otvoren. */
  keepOpen: boolean;
}

interface SubmitMeta {
  primary: PlanRef;
  refs: PlanRef[];
  label: string;
  created: boolean;
}

type Run = (plan: ChangePlan, meta: SubmitMeta, keepOpen: boolean) => Promise<boolean>;

const fullName = (p: { first_name: string; last_name: string }) =>
  `${p.first_name} ${p.last_name}`.trim() || '?';

const KIND_TABS: { value: Exclude<QuickAddKind, 'free'>; label: string }[] = [
  { value: 'child', label: STR.quickAdd.kindChild },
  { value: 'spouse', label: STR.quickAdd.kindSpouse },
  { value: 'parents', label: STR.quickAdd.kindParents },
  { value: 'sibling', label: STR.quickAdd.kindSibling },
];

const EYEBROW: Record<QuickAddKind, string> = {
  child: STR.quickAdd.eyebrowChild,
  spouse: STR.quickAdd.eyebrowSpouse,
  parents: STR.quickAdd.eyebrowParents,
  sibling: STR.quickAdd.eyebrowSibling,
  free: STR.quickAdd.eyebrowFree,
};

async function photoBlob(draft: Draft): Promise<Blob | null> {
  if (!draft.photo) return null;
  try {
    return await centerCropToBlob(draft.photo);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------------------
// Zajednički delovi
// ---------------------------------------------------------------------------

function ModeTabs({ mode, onChange }: { mode: 'new' | 'existing'; onChange: (m: 'new' | 'existing') => void }) {
  return (
    <Segmented
      label={STR.quickAdd.tabNew}
      value={mode}
      onChange={onChange}
      options={[
        { value: 'new', label: STR.quickAdd.tabNew },
        { value: 'existing', label: STR.quickAdd.tabExisting },
      ]}
    />
  );
}

function OptionList<T extends string | number>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string; note?: string; person?: PersonSlim }[];
  onChange: (v: T) => void;
}) {
  return (
    <div role="radiogroup" aria-label={label} className="space-y-1.5">
      <span className="zb-label block text-[11px] tracking-[.16em] text-faint">{label}</span>
      {options.map((o) => {
        const on = o.value === value;
        return (
          <button
            key={String(o.value)}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-3 py-1.5 text-left transition-colors ${
              on ? 'border-[1.5px] border-heading bg-cardbg' : 'border border-line hover:bg-surface2'
            }`}
          >
            <span
              aria-hidden="true"
              className={`h-4 w-4 shrink-0 rounded-full ${on ? 'border-[5px] border-heading bg-cardbg' : 'border-[1.5px] border-faint'}`}
            />
            {o.person && <Avatar person={o.person} size={24} />}
            <span className="min-w-0 flex-1 truncate text-base font-semibold text-ink">{o.label}</span>
            {o.note && <span className="shrink-0 text-sm text-muted">{o.note}</span>}
          </button>
        );
      })}
    </div>
  );
}

function ExistingPicker({
  persons,
  excludeIds,
  value,
  onChange,
  error,
  note,
}: {
  persons: PersonSlim[];
  excludeIds: number[];
  value: number | null;
  onChange: (id: number | null) => void;
  error?: string | undefined;
  note?: ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Field label={STR.quickAdd.pickExisting} error={error}>
        <RelativePicker persons={persons} excludeIds={excludeIds} value={value} onChange={onChange} />
      </Field>
      {note}
    </div>
  );
}

function Footer({
  busy,
  disabled,
  onCancel,
  cancelLabel,
  onMore,
}: {
  busy: boolean;
  disabled: boolean;
  onCancel: () => void;
  cancelLabel: string;
  onMore?: (() => void) | undefined;
}) {
  const online = useOnline();
  const off = disabled || busy || !online;
  return (
    <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-surface px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      <Button variant="secondary" onClick={onCancel} disabled={busy}>
        {cancelLabel}
      </Button>
      {onMore && (
        <Button
          variant="secondary"
          onClick={onMore}
          disabled={off}
          className="border-heading text-heading"
          title={!online ? STR.common.offlineDisabled : undefined}
        >
          {STR.quickAdd.saveAndMore}
        </Button>
      )}
      <Button type="submit" disabled={off} title={!online ? STR.common.offlineDisabled : undefined}>
        {STR.common.save}
      </Button>
    </div>
  );
}

interface KindProps {
  anchor: PersonSlim;
  tree: TreeResponse;
  run: Run;
  busy: boolean;
  isDesktop: boolean;
  cancelLabel: string;
  onCancel: () => void;
  onChangeKind: (k: QuickAddKind) => void;
}

/** Forma za ceo panel: telo skroluje, dugmad su zalepljena za dno. */
function PanelForm({ onSubmit, children, footer }: { onSubmit: () => void; children: ReactNode; footer: ReactNode }) {
  return (
    <form
      noValidate
      className="flex min-h-0 flex-1 flex-col"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit();
      }}
    >
      <div className="min-h-0 flex-1 space-y-4 overflow-y-auto px-4 py-3">{children}</div>
      {footer}
    </form>
  );
}

// ---------------------------------------------------------------------------
// Dete i brat/sestra — nova osoba sa zadatim roditeljima, ili postojeća kojoj se upisuju
// ---------------------------------------------------------------------------

function DescendantForm({ kind, anchor, tree, run, busy, isDesktop, cancelLabel, onCancel, onChangeKind }: KindProps & { kind: 'child' | 'sibling' }) {
  const partners = useMemo(() => (kind === 'child' ? partnersOf(tree, anchor.id) : []), [kind, tree, anchor.id]);
  const lines = useMemo(() => siblingLines(anchor), [anchor]);

  const [partnerId, setPartnerId] = useState<number | 0>(partners[0]?.person.id ?? 0);
  const [line, setLine] = useState<SiblingLine>(lines[0] ?? 'both');
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const [existingId, setExistingId] = useState<number | null>(null);
  const [errors, setErrors] = useState<DraftErrors & { existing?: string }>({});

  const slots: ParentSlots = useMemo(() => {
    if (kind === 'sibling') return siblingParentSlots(anchor, line);
    const partner = partnerId === 0 ? null : (tree.persons.find((p) => p.id === partnerId) ?? null);
    return assignParentSlots([anchor, partner]);
  }, [kind, anchor, line, partnerId, tree.persons]);

  const defaultSurname = inheritedSurname(slots, tree.persons);
  const [draft, setDraft] = useState<Draft>(() => emptyDraft({ last_name: defaultSurname }));
  const [surnameTouched, setSurnameTouched] = useState(false);
  useEffect(() => {
    if (!surnameTouched) setDraft((d) => ({ ...d, last_name: defaultSurname }));
  }, [defaultSurname, surnameTouched]);

  if (kind === 'sibling' && lines.length === 0) {
    return (
      <div className="space-y-3 px-4 py-4">
        <p className="text-base text-muted">{STR.quickAdd.siblingNoParents}</p>
        <Button onClick={() => onChangeKind('parents')}>{STR.quickAdd.siblingAddParents}</Button>
      </div>
    );
  }

  const parentIds = [slots.father_id, slots.mother_id].filter((x): x is number => x !== null);
  const excludeIds = [anchor.id, ...parentIds];
  const existing = existingId === null ? null : (tree.persons.find((p) => p.id === existingId) ?? null);
  const replaced = existing
    ? (['father_id', 'mother_id'] as const)
        .filter((s) => slots[s] !== null && existing[s] !== null && existing[s] !== slots[s])
        .map((s) => tree.persons.find((p) => p.id === existing[s]))
        .filter((p): p is PersonSlim => Boolean(p))
    : [];

  const submit = async (keepOpen: boolean) => {
    if (mode === 'existing') {
      if (!existing) {
        setErrors({ existing: STR.quickAdd.pickRequired });
        return;
      }
      const ref = { id: existing.id };
      const plan: ChangePlan = {
        creates: [],
        links: [
          {
            childId: existing.id,
            ...(slots.father_id !== null ? { father_id: { id: slots.father_id } } : {}),
            ...(slots.mother_id !== null ? { mother_id: { id: slots.mother_id } } : {}),
          },
        ],
        unions: [],
      };
      const ok = await run(plan, { primary: ref, refs: [ref], label: fullName(existing), created: false }, keepOpen);
      if (ok && keepOpen) setExistingId(null);
      return;
    }
    const v = validateDraft(draft, slots);
    if (!v.input) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    const ref = { key: 'p' };
    const ok = await run(
      { creates: [{ key: 'p', input: v.input, photo: await photoBlob(draft) }], links: [], unions: [] },
      { primary: ref, refs: [ref], label: fullName(v.input), created: true },
      keepOpen,
    );
    if (ok && keepOpen) {
      setDraft(emptyDraft({ last_name: draft.last_name }));
    }
  };

  const lineLabels: Record<SiblingLine, string> = {
    both: STR.quickAdd.siblingBoth,
    father: STR.quickAdd.siblingPaternal,
    mother: STR.quickAdd.siblingMaternal,
  };
  const nameOf = (id: number | null) => {
    const p = id === null ? null : tree.persons.find((x) => x.id === id);
    return p ? fullName(p) : '';
  };

  return (
    <PanelForm
      onSubmit={() => void submit(false)}
      footer={
        <Footer busy={busy} disabled={false} onCancel={onCancel} cancelLabel={cancelLabel} onMore={() => void submit(true)} />
      }
    >
      <ModeTabs mode={mode} onChange={setMode} />

      {kind === 'child' ? (
        <OptionList<number>
          label={STR.quickAdd.secondParent}
          value={partnerId}
          onChange={setPartnerId}
          options={[
            ...partners.map((o) => ({
              value: o.person.id,
              label: fullName(o.person),
              note: o.ended ? STR.quickAdd.endedUnion : STR.quickAdd.currentUnion,
              person: o.person,
            })),
            {
              value: 0,
              label: STR.quickAdd.unknownParent,
              note: `${STR.quickAdd.onlyAnchor} ${anchor.first_name}`,
            },
          ]}
        />
      ) : (
        lines.length > 1 && (
          <OptionList<SiblingLine>
            label={STR.quickAdd.siblingLine}
            value={line}
            onChange={setLine}
            options={lines.map((l) => ({
              value: l,
              label: lineLabels[l],
              note:
                l === 'both'
                  ? [nameOf(anchor.father_id), nameOf(anchor.mother_id)].filter(Boolean).join(' i ')
                  : nameOf(l === 'father' ? anchor.father_id : anchor.mother_id),
            }))}
          />
        )
      )}

      {mode === 'new' ? (
        <>
          <PersonDraftFields
            draft={draft}
            onChange={(patch) => {
              if (patch.last_name !== undefined) setSurnameTouched(true);
              setDraft((d) => ({ ...d, ...patch }));
            }}
            errors={errors}
            surnameHint={!surnameTouched && defaultSurname ? STR.quickAdd.surnameInherited : undefined}
            autoFocus={isDesktop}
          />
          <DuplicateHint
            draft={draft}
            persons={tree.persons}
            excludeIds={excludeIds}
            onLink={(id) => {
              setExistingId(id);
              setMode('existing');
            }}
          />
        </>
      ) : (
        <ExistingPicker
          persons={tree.persons}
          excludeIds={excludeIds}
          value={existingId}
          onChange={setExistingId}
          error={errors.existing}
          note={
            <>
              <p className="text-sm text-muted">{STR.quickAdd.existingChildNote}</p>
              {replaced.length > 0 && (
                <p className="text-sm text-danger">
                  {STR.quickAdd.replacesParent} {replaced.map(fullName).join(', ')}
                </p>
              )}
            </>
          }
        />
      )}
    </PanelForm>
  );
}

// ---------------------------------------------------------------------------
// Supružnik
// ---------------------------------------------------------------------------

function SpouseForm({ anchor, tree, run, busy, isDesktop, cancelLabel, onCancel }: KindProps) {
  const [mode, setMode] = useState<'new' | 'existing'>('new');
  const spouseGender = oppositeGender(anchor.gender);
  const [draft, setDraft] = useState<Draft>(() =>
    emptyDraft({
      gender: spouseGender,
      // Supruga po pravilu nosi muževljevo prezime; devojačko se upisuje posebno.
      last_name: spouseGender === 'F' && anchor.gender === 'M' ? anchor.last_name : '',
    }),
  );
  const [existingId, setExistingId] = useState<number | null>(null);
  const [type, setType] = useState<UnionType>('marriage');
  const [startDate, setStartDate] = useState('');
  const [errors, setErrors] = useState<DraftErrors & { existing?: string; start?: string }>({});

  // Isključi samu osobu i one sa kojima već ima aktivan brak.
  const excludeIds = useMemo(
    () => [anchor.id, ...partnersOf(tree, anchor.id).filter((o) => !o.ended).map((o) => o.person.id)],
    [tree, anchor.id],
  );

  const submit = async () => {
    const start = startDate.trim();
    if (start !== '' && !partialDateRegex.test(start)) {
      setErrors({ start: STR.person.datePlaceholder });
      return;
    }
    const union = { a: { id: anchor.id }, type, start_date: start === '' ? null : start };
    if (mode === 'existing') {
      const existing = existingId === null ? null : tree.persons.find((p) => p.id === existingId);
      if (!existing) {
        setErrors({ existing: STR.quickAdd.pickRequired });
        return;
      }
      const ref = { id: existing.id };
      await run(
        { creates: [], links: [], unions: [{ ...union, b: ref }] },
        { primary: ref, refs: [ref], label: fullName(existing), created: false },
        false,
      );
      return;
    }
    const v = validateDraft(draft, { father_id: null, mother_id: null });
    if (!v.input) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    const ref = { key: 'p' };
    await run(
      { creates: [{ key: 'p', input: v.input, photo: await photoBlob(draft) }], links: [], unions: [{ ...union, b: ref }] },
      { primary: ref, refs: [ref], label: fullName(v.input), created: true },
      false,
    );
  };

  return (
    <PanelForm
      onSubmit={() => void submit()}
      footer={<Footer busy={busy} disabled={false} onCancel={onCancel} cancelLabel={cancelLabel} />}
    >
      <ModeTabs mode={mode} onChange={setMode} />
      {mode === 'new' ? (
        <>
          <PersonDraftFields
            draft={draft}
            onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
            errors={errors}
            autoFocus={isDesktop}
          />
          <DuplicateHint
            draft={draft}
            persons={tree.persons}
            excludeIds={excludeIds}
            onLink={(id) => {
              setExistingId(id);
              setMode('existing');
            }}
          />
        </>
      ) : (
        <ExistingPicker
          persons={tree.persons}
          excludeIds={excludeIds}
          value={existingId}
          onChange={setExistingId}
          error={errors.existing}
        />
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label={STR.quickAdd.unionType}>
          <Select value={type} onChange={(e) => setType(e.target.value as UnionType)}>
            <option value="marriage">{STR.union.typeMarriage}</option>
            <option value="partnership">{STR.union.typePartnership}</option>
          </Select>
        </Field>
        <Field label={STR.union.startDate} error={errors.start}>
          <DateInput
            value={startDate}
            onChange={setStartDate}
            placeholder={STR.person.datePlaceholder}
            invalid={Boolean(errors.start)}
          />
        </Field>
      </div>
    </PanelForm>
  );
}

// ---------------------------------------------------------------------------
// Roditelji — oba odjednom, uz njihov brak
// ---------------------------------------------------------------------------

type ColMode = 'new' | 'existing' | 'skip';
type Slot = 'father_id' | 'mother_id';

function ParentsForm({ anchor, tree, run, busy, isDesktop, cancelLabel, onCancel }: KindProps) {
  const missing = missingParentSlots(anchor);
  const [modes, setModes] = useState<Record<Slot, ColMode>>({ father_id: 'new', mother_id: 'new' });
  // Prezime roditelja = rođeno prezime osobe (devojačko kod udatih), ne ono po mužu.
  const familySurname = anchor.maiden_name?.trim() || anchor.last_name;
  const [drafts, setDrafts] = useState<Record<Slot, Draft>>(() => ({
    father_id: emptyDraft({ gender: 'M', last_name: familySurname }),
    mother_id: emptyDraft({ gender: 'F', last_name: familySurname }),
  }));
  const [existing, setExisting] = useState<Record<Slot, number | null>>({ father_id: null, mother_id: null });
  const [errors, setErrors] = useState<Record<Slot, DraftErrors & { existing?: string }>>({
    father_id: {},
    mother_id: {},
  });
  const [formError, setFormError] = useState<string | null>(null);
  const [withUnion, setWithUnion] = useState(true);

  if (missing.length === 0) {
    return <p className="px-4 py-4 text-base text-muted">{STR.quickAdd.parentsComplete}</p>;
  }

  // „Nova osoba" bez imena = taj roditelj se ne upisuje (polje može ostati prazno).
  const blank = (slot: Slot) => modes[slot] === 'new' && drafts[slot].first_name.trim() === '';
  const refFor = (slot: Slot): PlanRef | null => {
    const already = anchor[slot];
    if (already !== null) return { id: already };
    if (modes[slot] === 'new') return blank(slot) ? null : { key: slot };
    if (modes[slot] === 'existing' && existing[slot] !== null) return { id: existing[slot]! };
    return null;
  };
  const fatherRef = refFor('father_id');
  const motherRef = refFor('mother_id');
  const unionExists =
    fatherRef !== null &&
    motherRef !== null &&
    'id' in fatherRef &&
    'id' in motherRef &&
    tree.unions.some(
      (u) =>
        (u.partner1_id === fatherRef.id && u.partner2_id === motherRef.id) ||
        (u.partner1_id === motherRef.id && u.partner2_id === fatherRef.id),
    );
  const canUnion = fatherRef !== null && motherRef !== null && !unionExists;

  const submit = async () => {
    const creates: ChangePlan['creates'] = [];
    const nextErrors: Record<Slot, DraftErrors & { existing?: string }> = { father_id: {}, mother_id: {} };
    let invalid = false;
    const names: string[] = [];
    for (const slot of missing) {
      if (blank(slot)) continue;
      if (modes[slot] === 'new') {
        const v = validateDraft(drafts[slot], { father_id: null, mother_id: null });
        if (!v.input) {
          nextErrors[slot] = v.errors;
          invalid = true;
          continue;
        }
        creates.push({ key: slot, input: v.input, photo: await photoBlob(drafts[slot]) });
        names.push(fullName(v.input));
      } else if (modes[slot] === 'existing') {
        const p = existing[slot] === null ? null : tree.persons.find((x) => x.id === existing[slot]);
        if (!p) {
          nextErrors[slot] = { existing: STR.quickAdd.pickRequired };
          invalid = true;
          continue;
        }
        names.push(fullName(p));
      }
    }
    setErrors(nextErrors);
    if (invalid) return;
    const link = {
      childId: anchor.id,
      ...(missing.includes('father_id') && fatherRef ? { father_id: fatherRef } : {}),
      ...(missing.includes('mother_id') && motherRef ? { mother_id: motherRef } : {}),
    };
    if (!('father_id' in link) && !('mother_id' in link)) {
      setFormError(STR.quickAdd.parentsNone);
      return;
    }
    setFormError(null);
    const refs = [link.father_id, link.mother_id].filter((r): r is PlanRef => Boolean(r));
    await run(
      {
        creates,
        links: [link],
        unions: withUnion && canUnion ? [{ a: fatherRef!, b: motherRef!, type: 'marriage' }] : [],
      },
      { primary: refs[0]!, refs, label: names.join(' i '), created: creates.length > 0 },
      false,
    );
  };

  const column = (slot: Slot) => {
    const title = slot === 'father_id' ? STR.quickAdd.father : STR.quickAdd.mother;
    const already = anchor[slot] === null ? null : tree.persons.find((p) => p.id === anchor[slot]);
    return (
      <section key={slot} className="space-y-3 rounded-xl border border-line p-3">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className={`h-5 w-[5px] rounded-sm ${slot === 'father_id' ? 'bg-male' : 'bg-female'}`}
          />
          <h3 className="font-display text-lg font-normal text-heading">{title}</h3>
        </div>
        {already ? (
          <p className="text-sm text-muted">
            {STR.quickAdd.parentAlready} <span className="font-semibold text-ink">{fullName(already)}</span>
          </p>
        ) : (
          <>
            <Segmented<ColMode>
              label={title}
              value={modes[slot]}
              onChange={(m) => setModes((s) => ({ ...s, [slot]: m }))}
              options={[
                { value: 'new', label: STR.quickAdd.tabNew },
                { value: 'existing', label: STR.quickAdd.tabExisting },
                { value: 'skip', label: STR.quickAdd.parentSkip },
              ]}
            />
            {modes[slot] === 'new' && (
              <>
                <PersonDraftFields
                  draft={drafts[slot]}
                  onChange={(patch) => setDrafts((d) => ({ ...d, [slot]: { ...d[slot], ...patch } }))}
                  errors={errors[slot]}
                  fixedGender
                  autoFocus={isDesktop && slot === missing[0]}
                />
                <DuplicateHint
                  draft={drafts[slot]}
                  persons={tree.persons}
                  excludeIds={[anchor.id]}
                  onLink={(id) => {
                    setExisting((s) => ({ ...s, [slot]: id }));
                    setModes((s) => ({ ...s, [slot]: 'existing' }));
                  }}
                />
              </>
            )}
            {modes[slot] === 'existing' && (
              <ExistingPicker
                persons={tree.persons}
                excludeIds={[anchor.id]}
                value={existing[slot]}
                onChange={(id) => setExisting((s) => ({ ...s, [slot]: id }))}
                error={errors[slot].existing}
              />
            )}
          </>
        )}
      </section>
    );
  };

  return (
    <PanelForm
      onSubmit={() => void submit()}
      footer={<Footer busy={busy} disabled={false} onCancel={onCancel} cancelLabel={cancelLabel} />}
    >
      {column('father_id')}
      {column('mother_id')}
      {canUnion && (
        <label className="flex min-h-11 cursor-pointer items-center gap-2.5 text-base">
          <input
            type="checkbox"
            checked={withUnion}
            onChange={(e) => setWithUnion(e.target.checked)}
            className="h-[18px] w-[18px] accent-[#1d3557] dark:accent-[#c29b47]"
          />
          {STR.quickAdd.parentsBoth}
        </label>
      )}
      <p className="text-sm text-muted">{STR.quickAdd.parentsHint}</p>
      {formError && <p className="text-sm text-danger">{formError}</p>}
    </PanelForm>
  );
}

// ---------------------------------------------------------------------------
// Nepovezana osoba (plutajuće dugme, prvi korak vodiča)
// ---------------------------------------------------------------------------

function FreeForm({ tree, run, busy, isDesktop, cancelLabel, onCancel }: Omit<KindProps, 'anchor' | 'onChangeKind'>) {
  const [draft, setDraft] = useState<Draft>(() => emptyDraft());
  const [errors, setErrors] = useState<DraftErrors>({});
  const submit = async () => {
    const v = validateDraft(draft, { father_id: null, mother_id: null });
    if (!v.input) {
      setErrors(v.errors);
      return;
    }
    setErrors({});
    const ref = { key: 'p' };
    await run(
      { creates: [{ key: 'p', input: v.input, photo: await photoBlob(draft) }], links: [], unions: [] },
      { primary: ref, refs: [ref], label: fullName(v.input), created: true },
      false,
    );
  };
  return (
    <PanelForm
      onSubmit={() => void submit()}
      footer={<Footer busy={busy} disabled={false} onCancel={onCancel} cancelLabel={cancelLabel} />}
    >
      <PersonDraftFields
        draft={draft}
        onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        errors={errors}
        autoFocus={isDesktop}
      />
      <DuplicateHint draft={draft} persons={tree.persons} excludeIds={[]} onLink={() => undefined} />
    </PanelForm>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

export interface QuickAddPanelProps {
  request: QuickAddRequest;
  tree: TreeResponse;
  isDesktop: boolean;
  onClose: () => void;
  onSaved: (saved: QuickAddSaved) => void;
  onChangeKind: (kind: QuickAddKind) => void;
  /** Vodič: „Preskoči" umesto „Otkaži". */
  onSkip?: (() => void) | undefined;
}

export function QuickAddPanel({ request, tree, isDesktop, onClose, onSaved, onChangeKind, onSkip }: QuickAddPanelProps) {
  const apply = useApplyPlan();
  const anchor = request.anchorId === null ? null : (tree.persons.find((p) => p.id === request.anchorId) ?? null);

  // Escape zatvara panel (osim dok se kuca u polju — tamo Escape zatvara padajuće liste).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.key !== 'Escape' || (t && ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName))) return;
      onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const run: Run = async (plan, meta, keepOpen) => {
    let res;
    try {
      res = await apply.mutateAsync(plan);
    } catch {
      return false; // poruku o grešci prikazuje useApplyPlan
    }
    const resolve = (r: PlanRef) => ('id' in r ? r.id : res.ids[r.key]!);
    onSaved({
      request,
      primaryId: resolve(meta.primary),
      ids: meta.refs.map(resolve),
      label: meta.label,
      created: meta.created,
      undo: res.undo,
      keepOpen,
    });
    return true;
  };

  const common = {
    tree,
    run,
    busy: apply.isPending,
    isDesktop,
    cancelLabel: onSkip ? STR.quickAdd.wizardSkip : STR.common.cancel,
    onCancel: onSkip ?? onClose,
  };

  const kind = anchor ? request.kind : 'free';
  const title = request.wizard?.title ?? (anchor ? fullName(anchor) : STR.quickAdd.freeTitle);
  const formKey = `${kind}-${request.anchorId ?? 'none'}`;

  const content = (
    <>
      <div className="flex items-start gap-3 border-b border-line px-4 pt-3 pb-2.5">
        {anchor && <Avatar person={anchor} size={40} />}
        <div className="min-w-0 flex-1">
          <p className="zb-label text-[11px] tracking-[.16em] text-faint">
            {request.wizard
              ? `${STR.quickAdd.wizardStep} ${request.wizard.step} ${STR.quickAdd.wizardOf} ${request.wizard.total} · ${EYEBROW[kind]}`
              : EYEBROW[kind]}
          </p>
          <h2 className="truncate font-display text-xl font-normal text-heading">{title}</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label={STR.common.close}
          className="-mr-1 cursor-pointer rounded-md p-2.5 text-muted hover:bg-surface2"
        >
          <X size={18} />
        </button>
      </div>

      {anchor && !request.wizard && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-line px-4 py-2 [scrollbar-width:none]" role="tablist" aria-label={STR.tree.addToCard}>
          {KIND_TABS.map((t) => (
            <button
              key={t.value}
              type="button"
              role="tab"
              aria-selected={kind === t.value}
              onClick={() => onChangeKind(t.value)}
              className={`zb-label min-h-9 shrink-0 cursor-pointer rounded-full px-3 text-[11px] transition-colors ${
                kind === t.value ? 'bg-navy text-onnav' : 'border border-line text-muted hover:bg-surface2'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      )}

      {anchor === null ? (
        <FreeForm key={formKey} {...common} />
      ) : kind === 'spouse' ? (
        <SpouseForm key={formKey} anchor={anchor} onChangeKind={onChangeKind} {...common} />
      ) : kind === 'parents' ? (
        <ParentsForm key={formKey} anchor={anchor} onChangeKind={onChangeKind} {...common} />
      ) : (
        <DescendantForm
          key={formKey}
          kind={kind === 'sibling' ? 'sibling' : 'child'}
          anchor={anchor}
          onChangeKind={onChangeKind}
          {...common}
        />
      )}
    </>
  );

  if (isDesktop) {
    return (
      <aside
        aria-label={EYEBROW[kind]}
        className="absolute inset-y-0 right-0 z-30 flex w-[420px] max-w-full flex-col border-l border-line bg-surface shadow-[-16px_0_40px_-20px_rgba(20,30,50,.4)]"
      >
        {content}
      </aside>
    );
  }

  return createPortal(
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-[rgba(15,25,45,.5)]" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={EYEBROW[kind]}
        className="absolute inset-x-0 bottom-0 flex max-h-[92dvh] flex-col rounded-t-[22px] bg-surface shadow-[0_-16px_40px_-18px_rgba(20,30,50,.5)]"
      >
        <div className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-line" aria-hidden="true" />
        {content}
      </div>
    </div>,
    document.body,
  );
}
