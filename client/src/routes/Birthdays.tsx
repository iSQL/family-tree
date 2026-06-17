import { useMemo } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { Info } from 'lucide-react';
import type { PersonSlim, Union } from '@shared/types';
import { filterTreeToFamily } from '@shared/families';
import { ageAt, daysBetween, formatPartialDate, nextBirthday } from '../lib/dates';
import { useTree } from '../hooks/useTree';
import { Avatar } from '../components/person/Avatar';
import { FamilyChooser } from '../components/family/FamilyChooser';
import { FamilyScopeBar } from '../components/family/FamilyScopeBar';
import { Button } from '../components/ui/Button';
import { Card, CardHeader } from '../components/ui/Card';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

interface BirthdayEntry {
  person: PersonSlim;
  days: number;
  turns: number | null;
}

interface AnniversaryEntry {
  union: Union;
  p1: PersonSlim;
  p2: PersonSlim;
  days: number;
  years: number | null;
}

/** 'za 1 dan' / 'za 2 dana' / 'za 21 dan' */
function daysLabel(n: number): string {
  return `za ${n} ${n % 10 === 1 && n % 100 !== 11 ? 'dan' : 'dana'}`;
}

/** 'puni 41 godinu' / 'puni 42 godine' / 'puni 45 godina' */
function turnsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word =
    m10 === 1 && m100 !== 11 ? 'godinu' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'godine' : 'godina';
  return `puni ${n} ${word}`;
}

/** '1 godina braka' / '2 godine braka' / '5 godina braka' */
function marriageYearsLabel(n: number): string {
  const m10 = n % 10;
  const m100 = n % 100;
  const word =
    m10 === 1 && m100 !== 11 ? 'godina' : m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14) ? 'godine' : 'godina';
  return `${n} ${word} ${STR.birthdays.marriageSuffix}`;
}

function DaysBadge({ days }: { days: number }) {
  if (days === 0) {
    return (
      <span className="shrink-0 rounded-full bg-amber-600 px-2.5 py-0.5 text-xs font-semibold text-white">
        {STR.birthdays.today}
      </span>
    );
  }
  if (days === 1) {
    return (
      <span className="shrink-0 rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-semibold text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        {STR.birthdays.tomorrow}
      </span>
    );
  }
  return <span className="shrink-0 text-xs text-stone-500 dark:text-stone-400">{daysLabel(days)}</span>;
}

function PersonLink({ person }: { person: PersonSlim }) {
  return (
    <Link
      to={`/?focus=${person.id}`}
      className="truncate text-sm font-medium hover:text-amber-700 hover:underline dark:hover:text-amber-400"
    >
      {person.first_name} {person.last_name}
    </Link>
  );
}

export default function BirthdaysPage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  // Podaci se računaju i prikazuju u okviru odabrane porodice (komponente fokusa).
  const familyTree = useMemo(
    () => (tree && focusId !== null ? filterTreeToFamily(tree, focusId) : null),
    [tree, focusId],
  );

  const computed = useMemo(() => {
    if (!familyTree) return null;
    const today = new Date();
    const byId = new Map(familyTree.persons.map((p) => [p.id, p]));

    const birthdays: BirthdayEntry[] = [];
    for (const p of familyTree.persons) {
      if (p.death_date !== null) continue;
      const next = nextBirthday(p.birth_date, today);
      if (next === null) continue; // samo pun datum rođenja
      birthdays.push({ person: p, days: daysBetween(today, next), turns: ageAt(p.birth_date, next) });
    }
    birthdays.sort(
      (a, b) => a.days - b.days || a.person.first_name.localeCompare(b.person.first_name, 'sr-Latn'),
    );

    const anniversaries: AnniversaryEntry[] = [];
    for (const u of familyTree.unions) {
      if (u.type !== 'marriage' || u.end_date !== null) continue;
      const p1 = byId.get(u.partner1_id);
      const p2 = byId.get(u.partner2_id);
      if (!p1 || !p2 || p1.death_date !== null || p2.death_date !== null) continue;
      const next = nextBirthday(u.start_date, today);
      if (next === null) continue; // samo pun datum venčanja
      anniversaries.push({ union: u, p1, p2, days: daysBetween(today, next), years: ageAt(u.start_date, next) });
    }
    anniversaries.sort((a, b) => a.days - b.days);

    return { birthdays, anniversaries };
  }, [familyTree]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.common.error}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  // Bez odabrane porodice → prvo izbor porodice.
  if (focusId === null || familyTree === null || computed === null) {
    return <FamilyChooser tree={tree} onPick={(id) => navigate(`/birthdays?focus=${id}`)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-4 p-4">
        <FamilyScopeBar familyTree={familyTree} onChange={() => navigate('/birthdays')} />
        <Card>
          <CardHeader title={STR.birthdays.birthdaysTitle} />
          {computed.birthdays.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">{STR.birthdays.emptyBirthdays}</p>
          ) : (
            <ul className="divide-y divide-stone-200 dark:divide-stone-700">
              {computed.birthdays.map(({ person, days, turns }) => (
                <li key={person.id} className="flex items-center gap-3 px-4 py-2.5">
                  <Avatar person={person} size={40} />
                  <div className="min-w-0 flex-1">
                    <PersonLink person={person} />
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {formatPartialDate(person.birth_date)}
                      {turns !== null && ` · ${turnsLabel(turns)}`}
                    </p>
                  </div>
                  <DaysBadge days={days} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <CardHeader title={STR.birthdays.anniversariesTitle} />
          {computed.anniversaries.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-stone-400">{STR.birthdays.emptyAnniversaries}</p>
          ) : (
            <ul className="divide-y divide-stone-200 dark:divide-stone-700">
              {computed.anniversaries.map(({ union, p1, p2, days, years }) => (
                <li key={union.id} className="flex items-center gap-3 px-4 py-2.5">
                  <span className="flex shrink-0 -space-x-2">
                    <Avatar person={p1} size={40} className="ring-2 ring-white dark:ring-stone-900" />
                    <Avatar person={p2} size={40} className="ring-2 ring-white dark:ring-stone-900" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <span className="flex flex-wrap items-center gap-x-1.5">
                      <PersonLink person={p1} />
                      <span className="text-xs text-stone-400">&</span>
                      <PersonLink person={p2} />
                    </span>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      {formatPartialDate(union.start_date)}
                      {years !== null && ` · ${marriageYearsLabel(years)}`}
                    </p>
                  </div>
                  <DaysBadge days={days} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <p className="flex items-center gap-1.5 px-1 text-xs text-stone-400 dark:text-stone-500">
          <Info size={14} aria-hidden="true" className="shrink-0" />
          {STR.birthdays.fullDateNote}
        </p>
      </div>
    </div>
  );
}
