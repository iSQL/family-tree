import { useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Baby, Cross, Heart, HeartCrack, type LucideIcon } from 'lucide-react';
import type { PersonSlim, Union } from '@shared/types';
import { comparePartialDates, formatPartialDate, parsePartialDate } from '../lib/dates';
import { useTree } from '../hooks/useTree';
import { Avatar } from '../components/person/Avatar';
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
  birth: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300',
  marriage: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  partnership: 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300',
  divorce: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
  death: 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-300',
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

  const groups = useMemo(() => (tree ? buildGroups(tree.persons, tree.unions) : null), [tree]);

  if (isPending) return <FullScreenSpinner />;

  if (isError || !groups) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
        <p className="text-sm text-stone-600 dark:text-stone-300">{STR.common.error}</p>
        <Button onClick={() => void refetch()}>{STR.common.retry}</Button>
      </div>
    );
  }

  if (groups.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <p className="text-sm text-stone-400">{STR.timeline.empty}</p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="mx-auto w-full max-w-2xl space-y-6 p-4">
        {groups.map((g) => (
          <section key={g.decade}>
            <h2 className="mb-2 text-sm font-bold text-amber-800 dark:text-amber-400">{g.decade}-e</h2>
            <ul className="ml-3.5 space-y-5 border-l-2 border-stone-200 py-1 pl-7 dark:border-stone-700">
              {g.events.map((e) => {
                const Icon = EVENT_ICON[e.type];
                return (
                  <li key={e.key} className="relative">
                    {/* Tačka na liniji */}
                    <span
                      aria-hidden="true"
                      className={`absolute top-0 -left-[43px] flex h-7 w-7 items-center justify-center rounded-full ring-4 ring-stone-100 dark:ring-stone-950 ${EVENT_ICON_CLASS[e.type]}`}
                    >
                      <Icon size={14} />
                    </span>
                    <p className="text-xs text-stone-500 dark:text-stone-400">
                      <span className="font-semibold text-stone-700 dark:text-stone-200">{EVENT_LABEL[e.type]}</span>
                      {' · '}
                      {formatPartialDate(e.date)}
                    </p>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {e.persons.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          onClick={() => navigate(`/?focus=${p.id}`)}
                          className="flex min-h-[36px] max-w-full cursor-pointer items-center gap-1.5 rounded-full border border-stone-300 bg-white py-1 pr-3 pl-1 text-sm hover:border-amber-600 hover:bg-amber-50 dark:border-stone-600 dark:bg-stone-800 dark:hover:bg-stone-700"
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
        ))}
      </div>
    </div>
  );
}
