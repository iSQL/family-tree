import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, TreeDeciduous } from 'lucide-react';
import { usePerson } from '../hooks/usePerson';
import { PersonDetailContent } from '../components/person/PersonDetailContent';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

/** Stranica osobe (mobilna varijanta drawera — ista sadržina). */
export default function PersonDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const navigate = useNavigate();
  const { data: person, isPending, isError } = usePerson(Number.isFinite(id) ? id : null);

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl p-4">
        <div className="mb-4 flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
            <ArrowLeft size={16} aria-hidden="true" />
            {STR.common.back}
          </Button>
          <Button variant="secondary" size="sm" onClick={() => navigate(`/?focus=${id}`)}>
            <TreeDeciduous size={16} aria-hidden="true" />
            {STR.tree.showInTree}
          </Button>
        </div>

        {isPending ? (
          <FullScreenSpinner />
        ) : isError || !person ? (
          <p className="text-sm text-stone-500 dark:text-stone-400">{STR.person.notFound}</p>
        ) : (
          <PersonDetailContent
            person={person}
            onPersonClick={(pid) => navigate(`/person/${pid}`)}
            onDeleted={() => navigate('/', { replace: true })}
          />
        )}
      </div>
    </div>
  );
}
