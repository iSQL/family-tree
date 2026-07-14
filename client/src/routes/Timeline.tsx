import { useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Baby, Cross, Heart, HeartCrack, type LucideIcon } from 'lucide-react';
import type { PersonSlim, Union } from '@shared/types';
import { filterTreeToFamily } from '@shared/families';
import { comparePartialDates, formatPartialDate, parsePartialDate } from '../lib/dates';
import { useTree } from '../hooks/useTree';
import { Avatar } from '../components/person/Avatar';
import { FamilyChooser } from '../components/family/FamilyChooser';
import { FamilyScopeBar } from '../components/family/FamilyScopeBar';
import { Button } from '../components/ui/Button';
import { FullScreenSpinner } from '../components/ui/Spinner';
import { STR } from '../lib/strings';

type EventType = 'birth' | 'marriage' | 'partnership' | 'divorce' | 'death';

interface TimelineEvent {
  key: string;
  type: EventType;
  /** Parcijalni ISO datum događaja. */
  date: string;
  year: number;
  persons: PersonSlim[];
}

interface DecadeGroup {
  decade: number;
  events: TimelineEvent[];
}

const EVENT_LABEL: Record<EventType, string> = {
  birth: STR.timeline.birth,
  marriage: STR.timeline.marriage,
  partnership: STR.timeline.partnership,
  divorce: STR.timeline.divorce,
  death: STR.timeline.death,
};

const EVENT_ICON: Record<EventType, LucideIcon> = {
  birth: Baby,
  marriage: Heart,
  partnership: Heart,
  divorce: HeartCrack,
  death: Cross,
};

const EVENT_ICON_CLASS: Record<EventType, string> = {
  birth: 'bg-[#e3ecf5] text-[#294d75] dark:bg-[#28466b] dark:text-[#cfe0f2]',
  marriage: 'bg-[#f2e7cd] text-[#8f6c24] dark:bg-[#4c411f] dark:text-[#e7cd85]',
  partnership: 'bg-[#f2e7cd] text-[#8f6c24] dark:bg-[#4c411f] dark:text-[#e7cd85]',
  divorce: 'bg-surface2 text-muted',
  death: 'bg-surface2 text-muted',
};

function buildGroups(persons: PersonSlim[], unions: Union[]): DecadeGroup[] {
  const byId = new Map(persons.map((p) => [p.id, p]));
  const events: TimelineEvent[] = [];

  for (const p of persons) {
    const b = parsePartialDate(p.birth_date);
    if (b !== null) events.push({ key: `birth-${p.id}`, type: 'birth', date: p.birth_date!, year: b.year, persons: [p] });
    const d = parsePartialDate(p.death_date);
    if (d !== null) events.push({ key: `death-${p.id}`, type: 'death', date: p.death_date!, year: d.year, persons: [p] });
  }

  for (const u of unions) {
    const partners = [byId.get(u.partner1_id), byId.get(u.partner2_id)].filter(
      (p): p is PersonSlim => p !== undefined,
    );
    if (partners.length === 0) continue;
    const start = parsePartialDate(u.start_date);
    if (start !== null) {
      events.push({
        key: `union-${u.id}`,
        type: u.type === 'marriage' ? 'marriage' : 'partnership',
        date: u.start_date!,
        year: start.year,
        persons: partners,
      });
    }
    const end = parsePartialDate(u.end_date);
    if (end !== null && u.end_reason === 'divorce') {
      events.push({ key: `divorce-${u.id}`, type: 'divorce', date: u.end_date!, year: end.year, persons: partners });
    }
  }

  events.sort((a, b) => comparePartialDates(a.date, b.date));

  const groups: DecadeGroup[] = [];
  for (const e of events) {
    const decade = Math.floor(e.year / 10) * 10;
    const last = groups[groups.length - 1];
    if (last && last.decade === decade) last.events.push(e);
    else groups.push({ decade, events: [e] });
  }
  return groups;
}

export default function TimelinePage() {
  const { data: tree, isPending, isError, refetch } = useTree();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const focusParam = searchParams.get('focus');
  const focusId = focusParam !== null && Number.isFinite(Number(focusParam)) ? Number(focusParam) : null;

  // Vremenska linija u okviru odabrane porodice (komponente fokusa).
  const familyTree = useMemo(
    () => (tree && focusId !== null ? filterTreeToFamily(tree, focusId) : null),
    [tree, focusId],
  );
  const groups = useMemo(
    () => (familyTree ? buildGroups(familyTree.persons, familyTree.unions) : null),
    [familyTree],
  );

  if (isPending) return <FullScreenSpinner />;

  if (isError || !tree) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-base text-muted">{STR.common.error}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  // Bez odabrane porodice → prvo izbor porodice.
  if (focusId === null || familyTree === null || groups === null) {
    return <FamilyChooser tree={tree} onPick={(id) => navigate(`/timeline?focus=${id}`)} />;
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
        <FamilyScopeBar familyTree={familyTree} onChange={() => navigate('/timeline')} />
        {groups.length === 0 ? (
          <p className="py-6 text-center text-sm text-faint">{STR.timeline.empty}</p>
        ) : (
          groups.map((g) => (
          <section key={g.decade}>
            <h2 className="mb-2 font-display text-lg font-normal text-goldd">{g.decade}-e</h2>
            <ul className="ml-3.5 space-y-5 border-l-2 border-line py-1 pl-7">
              {g.events.map((e) => {
                const Icon = EVENT_ICON[e.type];
                return (
                  <li key={e.key} className="relative">
                    {/* Tačka na liniji */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 -left-[43px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-bg ${EVENT_ICON_CLASS[e.type]}`}
                    >
                      <Icon size={14} />
                    </span>
                    <p className="text-sm text-muted">
                      <span className="zb-label text-[12px] tracking-[.04em] text-ink">{EVENT_LABEL[e.type]}</span>
                      {' · '}
                      {formatPartialDate(e.date)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {e.persons.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => navigate(`/?focus=${p.id}`)}
                          className="flex min-h-[36px] max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-line bg-cardbg py-1 pr-3 pl-1 text-sm text-ink hover:border-gold"
                        >
                          <Avatar person={p} size={24} />
                          <span className="truncate">
                            {p.first_name} {p.last_name}
                          </span>
                        </button>
                      ))}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
          ))
        )}
      </div>
    </div>
  );
}
