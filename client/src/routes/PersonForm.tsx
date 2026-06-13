import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { PersonDetail, PersonSlim, TreeResponse } from '@shared/types';
import type { PersonInput, PersonPatch } from '@shared/schemas';
import { useTree } from '../hooks/useTree';
import { usePerson } from '../hooks/usePerson';
import { useCreatePerson, useCreateUnion, useUpdatePerson } from '../hooks/useMutations';
import { PersonForm, type PersonFormValues } from '../components/person/PersonForm';
import { Button } from '../components/ui/Button';
import { Card } from '../components/ui/Card';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

function parseIdParam(value: string | null): number | null {
  if (value === null) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Partner osobe za prefill drugog roditelja deteta. Kod više brakova prednost
 * ima aktuelni (brak bez zabeleženog kraja) nad bivšim — dete koje dodaješ je
 * najčešće iz tekućeg braka. Korisnik svakako može da promeni roditelja u formi.
 */
function firstPartnerOf(tree: TreeResponse, personId: number): PersonSlim | null {
  const candidates: { id: number; ended: boolean }[] = [];
  for (const u of tree.unions) {
    const otherId =
      u.partner1_id === personId ? u.partner2_id : u.partner2_id === personId ? u.partner1_id : null;
    if (otherId === null) continue;
    candidates.push({ id: otherId, ended: u.end_date !== null || u.end_reason !== null });
  }
  candidates.sort((a, b) => Number(a.ended) - Number(b.ended)); // aktuelni brak pre bivšeg
  for (const { id } of candidates) {
    const partner = tree.persons.find((p) => p.id === id);
    if (partner) return partner;
  }
  return null;
}

/** Prefill za novu osobu na osnovu ?childOf / ?spouseOf / ?parentOf. */
function buildNewDefaults(
  tree: TreeResponse,
  childOf: number | null,
  spouseOf: number | null,
  parentOf: number | null,
): Partial<PersonFormValues> {
  const defaults: Partial<PersonFormValues> = {};

  if (childOf !== null) {
    const parent = tree.persons.find((p) => p.id === childOf);
    if (parent) {
      const partner = firstPartnerOf(tree, parent.id);
      const candidates = [parent, partner].filter((c): c is PersonSlim => c !== null);
      const father = candidates.find((c) => c.gender === 'M') ?? null;
      const mother = candidates.find((c) => c.gender === 'F') ?? null;
      defaults.father_id = father?.id ?? (mother === null ? parent.id : null);
      defaults.mother_id = mother?.id ?? null;
      defaults.last_name = (father ?? parent).last_name;
    }
  }

  if (spouseOf !== null) {
    const partner = tree.persons.find((p) => p.id === spouseOf);
    if (partner) {
      defaults.gender = partner.gender === 'M' ? 'F' : partner.gender === 'F' ? 'M' : 'U';
    }
  }

  if (parentOf !== null) {
    const child = tree.persons.find((p) => p.id === parentOf);
    if (child) {
      defaults.last_name = child.last_name;
      defaults.gender = child.father_id === null ? 'M' : 'F';
    }
  }

  return defaults;
}

function detailToFormValues(p: PersonDetail): PersonFormValues {
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
    father_id: p.father_id,
    mother_id: p.mother_id,
  };
}

export default function PersonFormPage() {
  const params = useParams();
  const editId = params.id !== undefined ? Number(params.id) : null;
  const isEdit = editId !== null && Number.isFinite(editId);

  const [searchParams] = useSearchParams();
  const childOf = parseIdParam(searchParams.get('childOf'));
  const spouseOf = parseIdParam(searchParams.get('spouseOf'));
  const parentOf = parseIdParam(searchParams.get('parentOf'));

  const navigate = useNavigate();
  const { data: tree, isPending: treePending } = useTree();
  const { data: editing, isPending: personPending, isError: personError } = usePerson(isEdit ? editId : null);

  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const createUnion = useCreateUnion();

  const submitting = createPerson.isPending || updatePerson.isPending || createUnion.isPending;

  const handleSubmit = (values: PersonInput) => {
    if (isEdit && editId !== null) {
      updatePerson.mutate(
        { id: editId, patch: values },
        { onSuccess: () => navigate(`/?focus=${editId}`) },
      );
      return;
    }
    createPerson.mutate(values, {
      onSuccess: async (created) => {
        try {
          if (spouseOf !== null) {
            await createUnion.mutateAsync({ partner1_id: created.id, partner2_id: spouseOf });
          }
          if (parentOf !== null) {
            // Upis nove osobe kao roditelja deteta — slot po polu, pa po slobodnom mestu.
            const child = tree?.persons.find((p) => p.id === parentOf);
            const patch: PersonPatch =
              values.gender === 'M'
                ? { father_id: created.id }
                : values.gender === 'F'
                  ? { mother_id: created.id }
                  : child?.father_id == null
                    ? { father_id: created.id }
                    : { mother_id: created.id };
            await updatePerson.mutateAsync({ id: parentOf, patch });
          }
        } finally {
          navigate(`/?focus=${created.id}`);
        }
      },
    });
  };

  if (treePending || !tree || (isEdit && personPending)) {
    return <FullScreenSpinner />;
  }

  if (isEdit && (personError || !editing)) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6">
        <p className="text-sm text-stone-500 dark:text-stone-400">{STR.person.notFound}</p>
        <Button variant="secondary" onClick={() => navigate('/')}>
          {STR.common.backToTree}
        </Button>
      </div>
    );
  }

  const defaults: Partial<PersonFormValues> =
    isEdit && editing ? detailToFormValues(editing) : buildNewDefaults(tree, childOf, spouseOf, parentOf);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} aria-hidden="true" />
            {STR.common.back}
          </Button>
          <h1 className="text-lg font-bold">{isEdit ? STR.person.editTitle : STR.person.newTitle}</h1>
        </div>
        <Card className="p-4 sm:p-6">
          <PersonForm
            key={isEdit ? `edit-${editId}` : 'new'}
            defaultValues={defaults}
            persons={tree.persons}
            personId={isEdit && editId !== null ? editId : undefined}
            photo={isEdit && editing ? { photo_id: editing.photo_id, person: editing } : undefined}
            submitting={submitting}
            onSubmit={handleSubmit}
            onCancel={() => navigate(-1)}
          />
        </Card>
      </div>
    </div>
  );
}
