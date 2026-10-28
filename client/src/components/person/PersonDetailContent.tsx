import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby, Crown, Heart, Pencil, Plus, TreeDeciduous, Trash2, UserPlus, Users, type LucideIcon } from 'lucide-react';
import type { PersonDetail, PersonSlim, UnionWithPartner } from '@shared/types';
import {
  useDeletePerson,
  useDeleteUnion,
  useUpdatePerson,
  type ChangePlan,
} from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { useReadonly } from '../../hooks/useAccess';
import { formatLifespan, formatPartialDate } from '../../lib/dates';
import { Avatar } from './Avatar';
import { UnionForm } from './UnionForm';
import { AddSpouseDialog } from './AddSpouseDialog';
import { Button } from '../ui/Button';
import { ConfirmDialog } from '../ui/Dialog';
import { STR } from '../../lib/strings';

function safeFormatDate(value: string | null): string {
  try {
    return formatPartialDate(value);
  } catch {
    return value ?? '';
  }
}

function PersonChip({ person, onClick, badge }: { person: PersonSlim; onClick: () => void; badge?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex min-h-[40px] max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-line bg-bg py-1 pr-3 pl-1 text-sm text-ink hover:border-gold"
    >
      <Avatar person={person} size={28} />
      <span className="truncate">
        {person.first_name} {person.last_name}
      </span>
      {badge && <span className="shrink-0 text-xs text-faint">({badge})</span>}
    </button>
  );
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section>
      <div className="mb-1.5 flex items-center justify-between">
        <h3 className="zb-label text-[11px] tracking-[.16em] text-faint">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function unionSummary(u: UnionWithPartner): string {
  const parts: string[] = [u.type === 'marriage' ? STR.union.typeMarriage : STR.union.typePartnership];
  if (u.start_date) parts.push(safeFormatDate(u.start_date));
  if (u.end_date || u.end_reason) {
    const reason =
      u.end_reason === 'divorce'
        ? STR.union.endReasonDivorce
        : u.end_reason === 'death'
          ? STR.union.endReasonDeath
          : u.end_reason === 'separation'
            ? STR.union.endReasonSeparation
            : '';
    parts.push(`do ${u.end_date ? safeFormatDate(u.end_date) : '?'}${reason ? ` (${reason.toLowerCase()})` : ''}`);
  }
  return parts.join(' · ');
}

/** Brzi unos srodnika iz detalja (otvara panel u stablu). */
export type QuickAddHandler = (kind: 'child' | 'spouse' | 'parents' | 'sibling', anchorId: number) => void;

/** Plan koji vraća obrisanu osobu: ista polja, roditelji, veze dece i brakovi (slika se ne vraća). */
function restorePersonPlan(p: PersonDetail): ChangePlan {
  return {
    creates: [
      {
        key: 'p',
        input: {
          first_name: p.first_name,
          last_name: p.last_name,
          maiden_name: p.maiden_name,
          gender: p.gender,
          title: p.title,
          birth_date: p.birth_date,
          death_date: p.death_date,
          birth_place: p.birth_place,
          notes: p.notes,
          father_id: p.father_id,
          mother_id: p.mother_id,
        },
        familyHead: p.is_family_head,
      },
    ],
    links: p.children.map((c) => ({
      childId: c.id,
      ...(c.father_id === p.id ? { father_id: { key: 'p' } } : {}),
      ...(c.mother_id === p.id ? { mother_id: { key: 'p' } } : {}),
    })),
    unions: p.unions
      .filter((u) => u.partner !== null)
      .map((u) => ({
        a: { key: 'p' },
        b: { id: u.partner!.id },
        type: u.type,
        start_date: u.start_date,
        end_date: u.end_date,
        end_reason: u.end_reason,
        notes: u.notes,
      })),
  };
}

function restoreUnionPlan(personId: number, u: UnionWithPartner): ChangePlan | undefined {
  if (!u.partner) return undefined;
  return {
    creates: [],
    links: [],
    unions: [
      {
        a: { id: personId },
        b: { id: u.partner.id },
        type: u.type,
        start_date: u.start_date,
        end_date: u.end_date,
        end_reason: u.end_reason,
        notes: u.notes,
      },
    ],
  };
}

function AddTile({
  icon: Icon,
  label,
  onClick,
  disabled,
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  title?: string | undefined;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      className="flex min-h-[76px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[14px] border border-line bg-cardbg px-1 text-center hover:border-gold disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:border-line"
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-activebg text-activefg">
        <Icon size={16} aria-hidden="true" />
      </span>
      <span className="text-sm leading-tight font-semibold text-ink">{label}</span>
    </button>
  );
}

export interface PersonDetailContentProps {
  person: PersonDetail;
  /** Klik na čip srodnika (refokus stabla ili navigacija). */
  onPersonClick: (id: number) => void;
  /** „Prikaži stablo odavde" — re-root na ovu osobu (samo iz drawera/sheeta). */
  onShowInTree?: (id: number) => void;
  /** Posle uspešnog brisanja osobe. */
  onDeleted: () => void;
  /** Brzi unos srodnika; bez njega pločice „Dodaj" vode na formu (samostalna stranica osobe). */
  onQuickAdd?: QuickAddHandler | undefined;
}

export function PersonDetailContent({
  person,
  onPersonClick,
  onShowInTree,
  onDeleted,
  onQuickAdd,
}: PersonDetailContentProps) {
  const navigate = useNavigate();
  const online = useOnline();
  const readonly = useReadonly();
  const deletePerson = useDeletePerson();
  const deleteUnion = useDeleteUnion();
  const updatePerson = useUpdatePerson();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editUnion, setEditUnion] = useState<UnionWithPartner | null>(null);
  const [deleteUnionTarget, setDeleteUnionTarget] = useState<UnionWithPartner | null>(null);
  const [addSpouseOpen, setAddSpouseOpen] = useState(false);

  const years = formatLifespan(person.birth_date, person.death_date);
  const offlineTitle = !online ? STR.common.offlineDisabled : undefined;
  const hasParent = person.father !== null || person.mother !== null;
  const missingParent = person.father === null || person.mother === null;

  // Pločice „Dodaj" — brzi unos u stablu, inače klasična forma.
  const add = (kind: Parameters<QuickAddHandler>[0]) => {
    if (onQuickAdd) return onQuickAdd(kind, person.id);
    if (kind === 'spouse') return setAddSpouseOpen(true);
    const param = kind === 'child' ? 'childOf' : kind === 'parents' ? 'parentOf' : 'siblingOf';
    navigate(`/person/new?${param}=${person.id}`);
  };

  return (
    <div className="space-y-5">
      {/* Zaglavlje */}
      <div className="flex items-center gap-4">
        <Avatar person={person} size={88} />
        <div className="min-w-0">
          <h2 className="font-display text-xl leading-tight font-normal text-heading">
            {person.first_name} {person.last_name}
            {person.title && (
              <span className="ml-1.5 font-sans text-sm text-muted">{person.title}</span>
            )}
          </h2>
          {person.maiden_name && (
            <p className="text-sm text-muted">
              {STR.person.maidenShort} {person.maiden_name}
            </p>
          )}
          {years && <p className="text-sm text-muted">{years}</p>}
          {person.birth_place && (
            <p className="text-sm text-muted">{person.birth_place}</p>
          )}
        </div>
      </div>

      {/* Dodavanje srodnika — krupne pločice na vrhu (Predlog 4) */}
      {!readonly && (
        <section aria-label={STR.tree.addToCard}>
          <h3 className="zb-label mb-1.5 text-[11px] tracking-[.16em] text-faint">{STR.tree.addToCard}</h3>
          <div className="grid grid-cols-4 gap-2">
            <AddTile icon={Baby} label={STR.tree.addChildShort} onClick={() => add('child')} disabled={!online} title={offlineTitle} />
            <AddTile icon={Heart} label={STR.tree.addSpouseShort} onClick={() => add('spouse')} disabled={!online} title={offlineTitle} />
            <AddTile
              icon={UserPlus}
              label={STR.tree.addParentsShort}
              onClick={() => add('parents')}
              disabled={!online || !missingParent}
              title={offlineTitle ?? (!missingParent ? STR.quickAdd.parentsComplete : undefined)}
            />
            <AddTile
              icon={Users}
              label={STR.tree.addSiblingShort}
              onClick={() => add('sibling')}
              disabled={!online || !hasParent}
              title={offlineTitle ?? (!hasParent ? STR.quickAdd.siblingNoParents : undefined)}
            />
          </div>
        </section>
      )}

      {/* Akcije */}
      <div className="flex flex-wrap gap-2">
        {onShowInTree && (
          <Button size="sm" variant="secondary" onClick={() => onShowInTree(person.id)}>
            <TreeDeciduous size={14} aria-hidden="true" />
            {STR.tree.showFromHere}
          </Button>
        )}
        {!readonly && (
          <>
            <Button size="sm" onClick={() => navigate(`/person/${person.id}/edit`)} disabled={!online} title={offlineTitle}>
              <Pencil size={14} aria-hidden="true" />
              {STR.common.edit}
            </Button>
            <Button
              size="sm"
              variant={person.is_family_head ? 'primary' : 'secondary'}
              onClick={() =>
                updatePerson.mutate({ id: person.id, patch: { is_family_head: !person.is_family_head } })
              }
              disabled={!online || updatePerson.isPending}
              title={offlineTitle}
            >
              <Crown size={14} aria-hidden="true" />
              {person.is_family_head ? STR.tree.unsetFamilyHead : STR.tree.setFamilyHead}
            </Button>
            <Button
              size="sm"
              variant="danger"
              onClick={() => setConfirmDeleteOpen(true)}
              disabled={!online}
              title={offlineTitle}
            >
              <Trash2 size={14} aria-hidden="true" />
              {STR.common.delete}
            </Button>
          </>
        )}
      </div>

      {/* Roditelji */}
      <Section title={STR.person.parents}>
        {person.father || person.mother ? (
          <div className="flex flex-wrap gap-1.5">
            {person.father && <PersonChip person={person.father} onClick={() => onPersonClick(person.father!.id)} />}
            {person.mother && <PersonChip person={person.mother} onClick={() => onPersonClick(person.mother!.id)} />}
          </div>
        ) : (
          <p className="text-sm text-faint">{STR.common.none}</p>
        )}
      </Section>

      {/* Braća i sestre */}
      {person.siblings.length > 0 && (
        <Section title={STR.person.siblings}>
          <div className="flex flex-wrap gap-1.5">
            {person.siblings.map((s) => (
              <PersonChip
                key={s.id}
                person={s}
                onClick={() => onPersonClick(s.id)}
                badge={
                  s.half === 'paternal' ? STR.person.halfPaternal : s.half === 'maternal' ? STR.person.halfMaternal : undefined
                }
              />
            ))}
          </div>
        </Section>
      )}

      {/* Brakovi */}
      {person.unions.length > 0 && (
        <Section
          title={STR.person.unions}
          action={
            !readonly ? (
              <button
                type="button"
                onClick={() => add('spouse')}
                disabled={!online}
                title={offlineTitle}
                className="flex cursor-pointer items-center gap-1 rounded-md px-1.5 py-0.5 text-xs text-muted hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
              >
                <Plus size={13} aria-hidden="true" />
                {STR.person.addSpouse}
              </button>
            ) : undefined
          }
        >
          <ul className="space-y-2">
            {person.unions.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {u.partner ? (
                    <PersonChip person={u.partner} onClick={() => onPersonClick(u.partner!.id)} />
                  ) : (
                    <span className="text-sm text-faint">{STR.union.unknownPartner}</span>
                  )}
                  <p className="mt-0.5 text-xs text-muted">{unionSummary(u)}</p>
                </div>
                {!readonly && (
                  <>
                    <button
                      type="button"
                      aria-label={STR.union.editTitle}
                      onClick={() => setEditUnion(u)}
                      disabled={!online}
                      title={offlineTitle}
                      className="cursor-pointer rounded-md p-2.5 text-faint hover:bg-surface2 hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={STR.union.deleteConfirmTitle}
                      onClick={() => setDeleteUnionTarget(u)}
                      disabled={!online}
                      title={offlineTitle}
                      className="cursor-pointer rounded-md p-2.5 text-faint hover:bg-surface2 hover:text-danger disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      <Trash2 size={14} />
                    </button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Deca */}
      {person.children.length > 0 && (
        <Section title={STR.person.children}>
          <div className="flex flex-wrap gap-1.5">
            {person.children.map((c) => (
              <PersonChip key={c.id} person={c} onClick={() => onPersonClick(c.id)} />
            ))}
          </div>
        </Section>
      )}

      {/* Beleške */}
      {person.notes && (
        <Section title={STR.person.notes}>
          <p className="text-base whitespace-pre-wrap text-muted">{person.notes}</p>
        </Section>
      )}

      {/* Dijalozi */}
      <ConfirmDialog
        open={confirmDeleteOpen}
        title={STR.person.deleteConfirmTitle}
        text={STR.person.deleteConfirmText}
        busy={deletePerson.isPending}
        onClose={() => setConfirmDeleteOpen(false)}
        onConfirm={() =>
          deletePerson.mutate({ id: person.id, restore: restorePersonPlan(person) }, {
            onSuccess: () => {
              setConfirmDeleteOpen(false);
              onDeleted();
            },
          })
        }
      />
      {editUnion && (
        <UnionForm key={editUnion.id} open onClose={() => setEditUnion(null)} union={editUnion} />
      )}
      {addSpouseOpen && (
        <AddSpouseDialog
          open={addSpouseOpen}
          onClose={() => setAddSpouseOpen(false)}
          person={person}
        />
      )}
      <ConfirmDialog
        open={deleteUnionTarget !== null}
        title={STR.union.deleteConfirmTitle}
        text={STR.union.deleteConfirmText}
        busy={deleteUnion.isPending}
        onClose={() => setDeleteUnionTarget(null)}
        onConfirm={() => {
          if (deleteUnionTarget) {
            deleteUnion.mutate(
              { id: deleteUnionTarget.id, restore: restoreUnionPlan(person.id, deleteUnionTarget) },
              { onSuccess: () => setDeleteUnionTarget(null) },
            );
          }
        }}
      />
    </div>
  );
}
