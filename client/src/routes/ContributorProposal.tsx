import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams } from 'react-router-dom';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import {
  AlertCircle,
  CheckCircle2,
  Heart,
  ListOrdered,
  Pencil,
  Plus,
  Send,
  Trash2,
  TreePine,
  UserPlus,
} from 'lucide-react';
import { checkProposal, personName } from '@shared/proposalCheck';
import { proposalAuthorSchema, type ProposalAuthorInput, type ProposedPersonFields } from '@shared/schemas';
import type {
  Gender,
  ParentRole,
  PersonRef,
  PersonSlim,
  ProposalIssue,
  ProposedPerson,
  PublicTokenInfo,
  TreeResponse,
} from '@shared/types';
import { ApiError } from '../api/client';
import { ProposalIssues } from '../components/proposals/ProposalIssues';
import {
  EMPTY_PROPOSED_VALUES,
  ProposedPersonDialog,
  proposedToFormValues,
  type ProposedPersonFormValues,
} from '../components/proposals/ProposedPersonDialog';
import { TreeCanvas } from '../components/tree/TreeCanvas';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { ConfirmDialog, Dialog } from '../components/ui/Dialog';
import { Field, Input, Textarea } from '../components/ui/Input';
import { Select } from '../components/ui/Select';
import { Spinner } from '../components/ui/Spinner';
import { publicPhotoUrl, usePublicToken, usePublicTree, useSubmitProposal } from '../hooks/useProposals';
import { formatTimestampDate } from '../lib/dates';
import {
  EMPTY_DRAFT,
  combineTree,
  describeRelations,
  draftToData,
  formatProposedLife,
  loadDraft,
  newTempId,
  nodeIdMap,
  removeProposedPerson,
  saveDraft,
  type ProposalDraft,
  type ProposalRelations,
} from '../lib/proposalDraft';
import { STR } from '../lib/strings';
import logoUrl from '../assets/zabari-logo.svg';

/** Šta forma za osobu trenutno radi. */
type FormIntent =
  | { kind: 'independent' }
  | { kind: 'child'; parent: PersonRef }
  | { kind: 'spouse'; partner: PersonRef }
  | { kind: 'parent'; child: PersonRef; role: ParentRole }
  | { kind: 'edit'; tempId: string };

const ROLE_FIELD: Record<ParentRole, 'father_id' | 'mother_id'> = { father: 'father_id', mother: 'mother_id' };
const OTHER_ROLE: Record<ParentRole, ParentRole> = { father: 'mother', mother: 'father' };
const ROLE_GENDER: Record<ParentRole, Gender> = { father: 'M', mother: 'F' };

interface AuthorValues {
  author_name: string;
  notes: string;
}

const authorResolver = zodResolver(proposalAuthorSchema) as unknown as Resolver<
  AuthorValues,
  unknown,
  ProposalAuthorInput
>;

const isError = (issue: ProposalIssue) => issue.severity === 'error';

function FullScreenMessage({
  icon,
  title,
  text,
  children,
}: {
  icon: ReactNode;
  title: string;
  text: string;
  children?: ReactNode;
}) {
  return (
    <div className="flex h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-md space-y-3 rounded-2xl border border-line bg-surface p-6 text-center">
        {icon}
        <h1 className="font-display text-2xl font-normal text-heading">{title}</h1>
        <p className="text-base text-muted">{text}</p>
        {children}
      </div>
    </div>
  );
}

/** /predlog/:token — rođak bez naloga predlaže nove osobe; ništa ne ulazi u stablo bez odobrenja. */
export default function ContributorProposalPage() {
  const { token = '' } = useParams<{ token: string }>();
  const info = usePublicToken(token);
  const tree = usePublicTree(token, info.isSuccess);

  if (info.isPending || (info.isSuccess && tree.isPending)) {
    return (
      <div className="flex h-dvh items-center justify-center bg-bg">
        <Spinner size={32} />
      </div>
    );
  }

  if (info.isError && info.error instanceof ApiError && info.error.status === 404) {
    return (
      <FullScreenMessage
        icon={<AlertCircle size={44} className="mx-auto text-danger" aria-hidden="true" />}
        title={STR.contributor.invalidTitle}
        text={STR.contributor.invalidText}
      />
    );
  }

  if (!info.data || !tree.data) {
    return (
      <FullScreenMessage
        icon={<AlertCircle size={44} className="mx-auto text-danger" aria-hidden="true" />}
        title={STR.errors.generic}
        text={STR.contributor.loadFailed}
      >
        <Button variant="secondary" onClick={() => void (info.isError ? info.refetch() : tree.refetch())}>
          {STR.common.retry}
        </Button>
      </FullScreenMessage>
    );
  }

  return <ContributorWorkspace token={token} info={info.data} tree={tree.data} />;
}

function ContributorWorkspace({ token, info, tree }: { token: string; info: PublicTokenInfo; tree: TreeResponse }) {
  const storageKey = `ft_predlog_${token}`;
  const [draft, setDraft] = useState<ProposalDraft>(() => loadDraft(storageKey));
  useEffect(() => saveDraft(storageKey, draft), [storageKey, draft]);

  const [view, setView] = useState<'tree' | 'list'>('tree');
  const [selectedNode, setSelectedNode] = useState<number | null>(null);
  const [intent, setIntent] = useState<FormIntent | null>(null);
  const [childRole, setChildRole] = useState<ParentRole>('father');
  const [otherParent, setOtherParent] = useState('');
  const [removing, setRemoving] = useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const submitMutation = useSubmitProposal(token);

  const relations = useMemo<ProposalRelations>(
    () => ({ persons: draft.persons, unions: draft.unions, parent_links: draft.parent_links }),
    [draft.persons, draft.unions, draft.parent_links],
  );
  const check = useMemo(() => checkProposal(tree, draftToData(tree, relations)), [tree, relations]);
  const nodeIds = useMemo(() => nodeIdMap(draft.persons), [draft.persons]);
  const tempByNode = useMemo(() => new Map([...nodeIds].map(([temp, node]) => [node, temp] as const)), [nodeIds]);
  const combined = useMemo(() => combineTree(tree, relations, nodeIds), [tree, relations, nodeIds]);
  const byNode = useMemo(() => new Map(combined.persons.map((p) => [p.id, p] as const)), [combined]);
  const proposedNodeIds = useMemo(() => [...nodeIds.values()], [nodeIds]);
  const photoUrl = useCallback((photoId: string) => publicPhotoUrl(token, photoId), [token]);
  const setAuthorMeta = useCallback(
    (author_name: string, notes: string) => setDraft((d) => ({ ...d, author_name, notes })),
    [],
  );

  const nodeOf = (ref: PersonRef): number | undefined => (typeof ref === 'number' ? ref : nodeIds.get(ref));
  const refOf = (node: number): PersonRef => (node < 0 ? (tempByNode.get(node) ?? node) : node);
  const personAt = (ref: PersonRef): PersonSlim | undefined => {
    const node = nodeOf(ref);
    return node === undefined ? undefined : byNode.get(node);
  };
  const nameOf = (ref: PersonRef): string => {
    const p = personAt(ref);
    return p ? personName(p) : '?';
  };

  /** Primeni izmenu nacrta samo ako ne uvodi novu grešku (krug, pol roditelja, zauzeto mesto…). */
  const commit = (next: ProposalDraft): boolean => {
    const known = new Set(check.issues.filter(isError).map((i) => i.message));
    const introduced = checkProposal(tree, draftToData(tree, next)).issues.find(
      (i) => isError(i) && !known.has(i.message),
    );
    if (introduced) {
      toast.error(introduced.message);
      return false;
    }
    setDraft(next);
    return true;
  };

  /** Uloga osobe kao roditelja deteta — iz pola, a za nepoznat pol bira korisnik. */
  const anchorRole = (anchor: PersonSlim): ParentRole =>
    anchor.gender === 'M' ? 'father' : anchor.gender === 'F' ? 'mother' : childRole;

  /** Mogući drugi roditelj: partneri i dosadašnji ko-roditelji osobe, odgovarajućeg pola. */
  const coParents = (anchor: PersonSlim, role: ParentRole): PersonSlim[] => {
    const ids = new Set<number>();
    for (const u of combined.unions) {
      if (u.partner1_id === anchor.id) ids.add(u.partner2_id);
      else if (u.partner2_id === anchor.id) ids.add(u.partner1_id);
    }
    for (const p of combined.persons) {
      if (p.father_id === anchor.id && p.mother_id !== null) ids.add(p.mother_id);
      if (p.mother_id === anchor.id && p.father_id !== null) ids.add(p.father_id);
    }
    return [...ids]
      .map((id) => byNode.get(id))
      .filter((p): p is PersonSlim => p !== undefined && p.gender !== ROLE_GENDER[role]);
  };

  const openIntent = (next: FormIntent) => {
    setSelectedNode(null);
    if (next.kind === 'child') {
      const anchor = personAt(next.parent);
      const role: ParentRole = anchor?.gender === 'F' ? 'mother' : 'father';
      const options = anchor ? coParents(anchor, role) : [];
      setChildRole(role);
      setOtherParent(options.length === 1 ? String(options[0]!.id) : '');
    }
    setIntent(next);
  };

  const savePerson = (values: ProposedPersonFields) => {
    if (!intent) return;
    let next: ProposalDraft;
    if (intent.kind === 'edit') {
      next = {
        ...draft,
        persons: draft.persons.map((p) => (p.temp_id === intent.tempId ? { ...p, ...values } : p)),
      };
    } else {
      const person: ProposedPerson = { ...values, temp_id: newTempId(), father_id: null, mother_id: null };
      next = { ...draft };
      if (intent.kind === 'child') {
        const anchor = personAt(intent.parent);
        const role = anchor ? anchorRole(anchor) : 'father';
        person[ROLE_FIELD[role]] = intent.parent;
        if (otherParent !== '') person[ROLE_FIELD[OTHER_ROLE[role]]] = refOf(Number(otherParent));
      } else if (intent.kind === 'spouse') {
        next.unions = [
          ...draft.unions,
          {
            partner1_id: intent.partner,
            partner2_id: person.temp_id,
            type: 'marriage',
            start_date: null,
            end_date: null,
            end_reason: null,
            notes: null,
          },
        ];
      } else if (intent.kind === 'parent') {
        const { child, role } = intent;
        if (typeof child === 'number') {
          next.parent_links = [...draft.parent_links, { child_id: child, parent_id: person.temp_id, role }];
        } else {
          next.persons = draft.persons.map((p) => {
            if (p.temp_id !== child) return p;
            return role === 'father' ? { ...p, father_id: person.temp_id } : { ...p, mother_id: person.temp_id };
          });
        }
      }
      next.persons = [...next.persons, person];
    }
    if (commit(next)) {
      toast.success(intent.kind === 'edit' ? STR.contributor.updated : STR.contributor.added);
      setIntent(null);
    }
  };

  const send = (author: ProposalAuthorInput) => {
    submitMutation.mutate(
      { ...author, persons: draft.persons, unions: draft.unions, parent_links: draft.parent_links },
      {
        onSuccess: () => {
          setDraft({ ...EMPTY_DRAFT, author_name: author.author_name });
          setReviewOpen(false);
          setSubmitted(true);
        },
        onError: (err) => toast.error(err instanceof Error ? err.message : STR.errors.generic),
      },
    );
  };

  if (submitted) {
    return (
      <FullScreenMessage
        icon={<CheckCircle2 size={48} className="mx-auto text-goldd" aria-hidden="true" />}
        title={STR.contributor.successTitle}
        text={STR.contributor.successText}
      >
        <Button
          onClick={() => {
            setSubmitted(false);
            setView('tree');
          }}
        >
          {STR.contributor.sendAnother}
        </Button>
      </FullScreenMessage>
    );
  }

  const formConfig = ((): { title: string; defaults: ProposedPersonFormValues; lockedGender?: Gender } | null => {
    if (!intent) return null;
    switch (intent.kind) {
      case 'independent':
        return { title: STR.contributor.titleIndependent, defaults: EMPTY_PROPOSED_VALUES };
      case 'child':
        return {
          title: `${STR.contributor.titleChild} ${nameOf(intent.parent)}`,
          defaults: { ...EMPTY_PROPOSED_VALUES, last_name: personAt(intent.parent)?.last_name ?? '' },
        };
      case 'spouse': {
        const partnerGender = personAt(intent.partner)?.gender;
        return {
          title: `${STR.contributor.titleSpouse} ${nameOf(intent.partner)}`,
          defaults: {
            ...EMPTY_PROPOSED_VALUES,
            gender: partnerGender === 'M' ? 'F' : partnerGender === 'F' ? 'M' : 'U',
          },
        };
      }
      case 'parent':
        return {
          title: `${intent.role === 'father' ? STR.contributor.titleFather : STR.contributor.titleMother} ${nameOf(intent.child)}`,
          defaults: {
            ...EMPTY_PROPOSED_VALUES,
            gender: ROLE_GENDER[intent.role],
            last_name: intent.role === 'father' ? (personAt(intent.child)?.last_name ?? '') : '',
          },
          lockedGender: ROLE_GENDER[intent.role],
        };
      case 'edit': {
        const p = draft.persons.find((x) => x.temp_id === intent.tempId);
        return p ? { title: STR.contributor.titleEdit, defaults: proposedToFormValues(p) } : null;
      }
    }
  })();

  const renderChildParents = (): ReactNode => {
    if (intent?.kind !== 'child') return null;
    const anchor = personAt(intent.parent);
    if (!anchor) return null;
    const role = anchorRole(anchor);
    const options = coParents(anchor, role);
    return (
      <div className="space-y-3 rounded-xl border border-line bg-bg p-3">
        {anchor.gender === 'U' && (
          <fieldset>
            <legend className="zb-label mb-1 block text-[11px] tracking-[.16em] text-faint">
              {STR.contributor.roleOf} {personName(anchor)}
            </legend>
            <div className="flex gap-4">
              {(['father', 'mother'] as const).map((r) => (
                <label key={r} className="flex cursor-pointer items-center gap-1.5 text-sm">
                  <input
                    type="radio"
                    name="anchor-role"
                    checked={childRole === r}
                    onChange={() => {
                      setChildRole(r);
                      setOtherParent('');
                    }}
                    className="accent-[#1d3557] dark:accent-[#c29b47]"
                  />
                  {r === 'father' ? STR.person.father : STR.person.mother}
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <Field label={role === 'father' ? STR.person.mother : STR.person.father}>
          <Select value={otherParent} onChange={(e) => setOtherParent(e.target.value)}>
            <option value="">{STR.contributor.otherParentUnknown}</option>
            {options.map((p) => (
              <option key={p.id} value={String(p.id)}>
                {personName(p)}
              </option>
            ))}
          </Select>
        </Field>
      </div>
    );
  };

  const selected = selectedNode === null ? undefined : byNode.get(selectedNode);
  const selectedRef = selectedNode === null ? null : refOf(selectedNode);

  return (
    <div className="flex h-dvh flex-col bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5">
        <div className="flex min-w-0 items-center gap-2.5">
          <img src={logoUrl} alt="" width={28} height={28} className="rounded-full" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-base text-heading">{STR.appName}</span>
              <span className="zb-label rounded-full bg-activebg px-2 py-0.5 text-[10px] tracking-[.12em] text-activefg">
                {STR.contributor.modeBadge}
              </span>
            </div>
            <p className="truncate text-xs text-muted">
              {STR.contributor.invitation}: {info.label} · {STR.contributor.validUntil}{' '}
              {formatTimestampDate(info.expires_at)}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" variant={view === 'tree' ? 'primary' : 'secondary'} aria-pressed={view === 'tree'} onClick={() => setView('tree')}>
            <TreePine size={14} aria-hidden="true" />
            {STR.contributor.viewTree}
          </Button>
          <Button size="sm" variant={view === 'list' ? 'primary' : 'secondary'} aria-pressed={view === 'list'} onClick={() => setView('list')}>
            <ListOrdered size={14} aria-hidden="true" />
            {STR.contributor.viewList} ({draft.persons.length})
          </Button>
          <Button size="sm" variant="secondary" onClick={() => openIntent({ kind: 'independent' })}>
            <Plus size={14} aria-hidden="true" />
            {STR.contributor.newBranch}
          </Button>
          <Button size="sm" variant="gold" onClick={() => setReviewOpen(true)} disabled={draft.persons.length === 0}>
            <Send size={14} aria-hidden="true" />
            {STR.contributor.send}
          </Button>
        </div>
      </header>
      <p className="border-b border-line bg-surface px-4 py-2 text-xs text-muted">{STR.contributor.hint}</p>

      <main className="relative min-h-0 flex-1 overflow-hidden">
        {view === 'tree' ? (
          combined.persons.length === 0 ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
              <p className="text-base text-muted">{STR.contributor.emptyTree}</p>
              <Button onClick={() => openIntent({ kind: 'independent' })}>
                <Plus size={14} aria-hidden="true" />
                {STR.contributor.newBranch}
              </Button>
            </div>
          ) : (
            <TreeCanvas
              tree={combined}
              focusId={null}
              onPersonClick={setSelectedNode}
              selectedIds={proposedNodeIds}
              photoUrl={photoUrl}
            />
          )
        ) : (
          <div className="h-full overflow-y-auto">
            <div className="mx-auto w-full max-w-2xl space-y-3 p-4">
              <h2 className="font-display text-xl font-normal text-heading">{STR.contributor.draftTitle}</h2>
              <ProposalIssues issues={check.issues} errorsTitle={STR.contributor.fixErrors} />
              {draft.persons.length === 0 ? (
                <Card>
                  <div className="space-y-3 p-6 text-center">
                    <p className="text-base text-muted">{STR.contributor.draftEmpty}</p>
                    <Button variant="secondary" onClick={() => openIntent({ kind: 'independent' })}>
                      <Plus size={14} aria-hidden="true" />
                      {STR.contributor.newBranch}
                    </Button>
                  </div>
                </Card>
              ) : (
                draft.persons.map((p) => {
                  const life = formatProposedLife(p);
                  return (
                    <Card key={p.temp_id}>
                      <div className="flex items-start justify-between gap-3 p-3.5">
                        <div className="min-w-0 space-y-0.5">
                          <p className="font-medium text-heading">{personName(p)}</p>
                          {life && <p className="text-xs text-muted">{life}</p>}
                          {describeRelations(relations, p, nameOf).map((line) => (
                            <p key={line} className="text-sm text-ink">
                              {line}
                            </p>
                          ))}
                        </div>
                        <div className="flex shrink-0 gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIntent({ kind: 'edit', tempId: p.temp_id })}
                            aria-label={`${STR.contributor.editProposed}: ${personName(p)}`}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setRemoving(p.temp_id)}
                            aria-label={`${STR.contributor.removeProposed}: ${personName(p)}`}
                          >
                            <Trash2 size={15} className="text-danger" aria-hidden="true" />
                          </Button>
                        </div>
                      </div>
                    </Card>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {selected && selectedRef !== null && (
        <Dialog open onClose={() => setSelectedNode(null)} title={personName(selected)}>
          <p className="mb-3 text-base text-muted">{STR.contributor.actionsHint}</p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => openIntent({ kind: 'child', parent: selectedRef })}>
              <UserPlus size={14} aria-hidden="true" />
              {STR.contributor.addChild}
            </Button>
            <Button variant="secondary" onClick={() => openIntent({ kind: 'spouse', partner: selectedRef })}>
              <Heart size={14} aria-hidden="true" />
              {STR.contributor.addSpouse}
            </Button>
            {selected.father_id === null && (
              <Button variant="secondary" onClick={() => openIntent({ kind: 'parent', child: selectedRef, role: 'father' })}>
                <UserPlus size={14} aria-hidden="true" />
                {STR.contributor.addFather}
              </Button>
            )}
            {selected.mother_id === null && (
              <Button variant="secondary" onClick={() => openIntent({ kind: 'parent', child: selectedRef, role: 'mother' })}>
                <UserPlus size={14} aria-hidden="true" />
                {STR.contributor.addMother}
              </Button>
            )}
          </div>
          {selected.father_id !== null && selected.mother_id !== null && (
            <p className="mt-2 text-xs text-faint">{STR.contributor.bothParentsKnown}</p>
          )}
          {typeof selectedRef === 'string' && (
            <div className="mt-3 flex flex-wrap gap-2 border-t border-line pt-3">
              <Button
                variant="secondary"
                onClick={() => {
                  setSelectedNode(null);
                  setIntent({ kind: 'edit', tempId: selectedRef });
                }}
              >
                <Pencil size={14} aria-hidden="true" />
                {STR.contributor.editProposed}
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setSelectedNode(null);
                  setRemoving(selectedRef);
                }}
              >
                <Trash2 size={14} className="text-danger" aria-hidden="true" />
                {STR.contributor.removeProposed}
              </Button>
            </div>
          )}
        </Dialog>
      )}

      {formConfig && (
        <ProposedPersonDialog
          title={formConfig.title}
          defaultValues={formConfig.defaults}
          lockedGender={formConfig.lockedGender}
          existingPersons={tree.persons}
          submitLabel={intent?.kind === 'edit' ? STR.common.save : STR.common.add}
          onSubmit={savePerson}
          onClose={() => setIntent(null)}
        >
          {renderChildParents()}
        </ProposedPersonDialog>
      )}

      <ConfirmDialog
        open={removing !== null}
        title={STR.contributor.confirmRemoveTitle}
        text={STR.contributor.confirmRemoveText}
        confirmLabel={STR.contributor.removeProposed}
        onConfirm={() => {
          if (removing !== null) setDraft(removeProposedPerson(draft, removing));
          setRemoving(null);
          toast.success(STR.contributor.removed);
        }}
        onClose={() => setRemoving(null)}
      />

      {reviewOpen && (
        <SubmitDialog
          draft={draft}
          issues={check.issues}
          busy={submitMutation.isPending}
          onMetaChange={setAuthorMeta}
          onSubmit={send}
          onClose={() => setReviewOpen(false)}
        />
      )}
    </div>
  );
}

function SubmitDialog({
  draft,
  issues,
  busy,
  onMetaChange,
  onSubmit,
  onClose,
}: {
  draft: ProposalDraft;
  issues: ProposalIssue[];
  busy: boolean;
  onMetaChange: (authorName: string, notes: string) => void;
  onSubmit: (input: ProposalAuthorInput) => void;
  onClose: () => void;
}) {
  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<AuthorValues, unknown, ProposalAuthorInput>({
    resolver: authorResolver,
    defaultValues: { author_name: draft.author_name, notes: draft.notes },
  });

  // Ime i poruka se čuvaju u nacrtu dok se kuca — ne gube se ako se dijalog zatvori.
  useEffect(() => {
    const subscription = watch((v) => onMetaChange(v.author_name ?? '', v.notes ?? ''));
    return () => subscription.unsubscribe();
  }, [watch, onMetaChange]);

  const blocked = issues.some(isError);

  return (
    <Dialog
      open
      onClose={onClose}
      title={STR.contributor.reviewTitle}
      maxWidthClass="sm:max-w-lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {STR.common.cancel}
          </Button>
          <Button variant="gold" type="submit" form="submit-proposal-form" disabled={busy || blocked}>
            <Send size={14} aria-hidden="true" />
            {busy ? STR.contributor.submitting : STR.contributor.submit}
          </Button>
        </>
      }
    >
      <form id="submit-proposal-form" onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
        <p className="text-base text-muted">{STR.contributor.reviewIntro}</p>
        <ul className="space-y-1 rounded-xl border border-line bg-bg p-3 text-sm">
          {draft.persons.map((p) => {
            const life = formatProposedLife(p);
            return (
              <li key={p.temp_id}>
                <span className="text-heading">{personName(p)}</span>
                {life && <span className="text-muted"> · {life}</span>}
              </li>
            );
          })}
        </ul>
        <ProposalIssues issues={issues} errorsTitle={STR.contributor.fixErrors} />
        <Field label={`${STR.contributor.authorName} *`} error={errors.author_name?.message}>
          <Input {...register('author_name')} placeholder={STR.contributor.authorNamePlaceholder} autoComplete="name" />
        </Field>
        <Field label={STR.contributor.authorNotes} error={errors.notes?.message}>
          <Textarea rows={3} {...register('notes')} placeholder={STR.contributor.authorNotesPlaceholder} />
        </Field>
      </form>
    </Dialog>
  );
}
