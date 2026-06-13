import { useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Pencil, TreeDeciduous, Trash2, UserPlus } from 'lucide-react';
import type { PersonDetail, PersonSlim, UnionWithPartner } from '@shared/types';
import { useDeletePerson, useDeleteUnion } from '../../hooks/useMutations';
import { useOnline } from '../../hooks/useOnline';
import { useReadonly } from '../../hooks/useAccess';
import { formatLifespan, formatPartialDate } from '../../lib/dates';
import { Avatar } from './Avatar';
import { UnionForm } from './UnionForm';
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
      className="flex min-h-[40px] max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white py-1 pr-3 pl-1 text-sm hover:border-amber-600 hover:bg-amber-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
    >
      <Avatar person={person} size={28} />
      <span className="truncate">
        {person.first_name} {person.last_name}
      </span>
      {badge && <span className="shrink-0 text-xs text-stone-400">({badge})</span>}
    </button>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="mb-1.5 text-xs font-semibold tracking-wide text-stone-500 uppercase dark:text-stone-400">
        {title}
      </h3>
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

export interface PersonDetailContentProps {
  person: PersonDetail;
  /** Klik na čip srodnika (refokus stabla ili navigacija). */
  onPersonClick: (id: number) => void;
  /** „Prikaži stablo odavde" — re-root na ovu osobu (samo iz drawera/sheeta). */
  onShowInTree?: (id: number) => void;
  /** Posle uspešnog brisanja osobe. */
  onDeleted: () => void;
}

export function PersonDetailContent({ person, onPersonClick, onShowInTree, onDeleted }: PersonDetailContentProps) {
  const navigate = useNavigate();
  const online = useOnline();
  const readonly = useReadonly();
  const deletePerson = useDeletePerson();
  const deleteUnion = useDeleteUnion();

  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  const [editUnion, setEditUnion] = useState<UnionWithPartner | null>(null);
  const [deleteUnionTarget, setDeleteUnionTarget] = useState<UnionWithPartner | null>(null);

  const years = formatLifespan(person.birth_date, person.death_date);
  const offlineTitle = !online ? STR.common.offlineDisabled : undefined;

  return (
    <div className="space-y-5">
      {/* Zaglavlje */}
      <div className="flex items-center gap-4">
        <Avatar person={person} size={88} />
        <div className="min-w-0">
          <h2 className="text-lg leading-tight font-bold">
            {person.first_name} {person.last_name}
            {person.title && (
              <span className="ml-1.5 text-sm font-normal text-stone-500 dark:text-stone-400">{person.title}</span>
            )}
          </h2>
          {person.maiden_name && (
            <p className="text-sm text-stone-500 dark:text-stone-400">
              {STR.person.maidenShort} {person.maiden_name}
            </p>
          )}
          {years && <p className="text-sm text-stone-500 dark:text-stone-400">{years}</p>}
          {person.birth_place && (
            <p className="text-sm text-stone-500 dark:text-stone-400">{person.birth_place}</p>
          )}
        </div>
      </div>

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
              variant="secondary"
              onClick={() => navigate(`/person/new?childOf=${person.id}`)}
              disabled={!online}
              title={offlineTitle}
            >
              <UserPlus size={14} aria-hidden="true" />
              {STR.person.addChild}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => navigate(`/person/new?spouseOf=${person.id}`)}
              disabled={!online}
              title={offlineTitle}
            >
              <Heart size={14} aria-hidden="true" />
              {STR.person.addSpouse}
            </Button>
            {(person.father === null || person.mother === null) && (
              <Button
                size="sm"
                variant="secondary"
                onClick={() => navigate(`/person/new?parentOf=${person.id}`)}
                disabled={!online}
                title={offlineTitle}
              >
                <UserPlus size={14} aria-hidden="true" />
                {STR.person.addParent}
              </Button>
            )}
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
          <p className="text-sm text-stone-400">{STR.common.none}</p>
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
        <Section title={STR.person.unions}>
          <ul className="space-y-2">
            {person.unions.map((u) => (
              <li key={u.id} className="flex items-center gap-2">
                <div className="min-w-0 flex-1">
                  {u.partner ? (
                    <PersonChip person={u.partner} onClick={() => onPersonClick(u.partner!.id)} />
                  ) : (
                    <span className="text-sm text-stone-400">{STR.union.unknownPartner}</span>
                  )}
                  <p className="mt-0.5 text-xs text-stone-500 dark:text-stone-400">{unionSummary(u)}</p>
                </div>
                {!readonly && (
                  <>
                    <button
                      type="button"
                      aria-label={STR.union.editTitle}
                      onClick={() => setEditUnion(u)}
                      disabled={!online}
                      title={offlineTitle}
                      className="cursor-pointer rounded-md p-2.5 text-stone-400 hover:bg-stone-200/70 hover:text-stone-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-stone-700 dark:hover:text-stone-200"
                    >
                      <Pencil size={14} />
                    </button>
                    <button
                      type="button"
                      aria-label={STR.union.deleteConfirmTitle}
                      onClick={() => setDeleteUnionTarget(u)}
                      disabled={!online}
                      title={offlineTitle}
                      className="cursor-pointer rounded-md p-2.5 text-stone-400 hover:bg-red-100 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-40 dark:hover:bg-red-950 dark:hover:text-red-400"
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
          <p className="text-sm whitespace-pre-wrap text-stone-600 dark:text-stone-300">{person.notes}</p>
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
          deletePerson.mutate(person.id, {
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
      <ConfirmDialog
        open={deleteUnionTarget !== null}
        title={STR.union.deleteConfirmTitle}
        text={STR.union.deleteConfirmText}
        busy={deleteUnion.isPending}
        onClose={() => setDeleteUnionTarget(null)}
        onConfirm={() => {
          if (deleteUnionTarget) {
            deleteUnion.mutate(deleteUnionTarget.id, { onSuccess: () => setDeleteUnionTarget(null) });
          }
        }}
      />
    </div>
  );
}
