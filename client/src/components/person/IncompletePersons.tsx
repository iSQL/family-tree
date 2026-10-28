import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { TreeResponse } from '@shared/types';
import { missingInfo } from '@shared/quickAdd';
import { Avatar } from './Avatar';
import { STR } from '../../lib/strings';

const PAGE = 20;

/** Spisak osoba bez pola ili datuma rođenja — klik vodi na osobu u stablu. */
export function IncompletePersons({ tree }: { tree: TreeResponse }) {
  const [limit, setLimit] = useState(PAGE);
  const incomplete = useMemo(
    () =>
      tree.persons
        .map((p) => ({ p, missing: missingInfo(p) }))
        .filter((x) => x.missing.length > 0)
        .sort((a, b) =>
          `${a.p.last_name} ${a.p.first_name}`.localeCompare(`${b.p.last_name} ${b.p.first_name}`, 'sr'),
        ),
    [tree.persons],
  );

  if (incomplete.length === 0) return <p className="text-sm text-muted">{STR.incomplete.none}</p>;

  return (
    <div className="space-y-2">
      <p className="text-sm text-muted">
        {STR.incomplete.hint} <span className="font-semibold text-ink">({incomplete.length})</span>
      </p>
      <ul className="divide-y divide-line rounded-xl border border-line bg-bg">
        {incomplete.slice(0, limit).map(({ p, missing }) => (
          <li key={p.id}>
            <Link
              to={`/?focus=${p.id}`}
              className="flex min-h-11 items-center gap-2.5 px-3 py-1.5 text-sm hover:bg-surface2"
            >
              <Avatar person={p} size={26} />
              <span className="min-w-0 flex-1 truncate text-ink">
                {p.first_name} {p.last_name}
              </span>
              <span className="shrink-0 text-xs text-muted">
                {STR.incomplete.missing}{' '}
                {missing.map((m) => (m === 'gender' ? STR.incomplete.gender : STR.incomplete.birth)).join(', ')}
              </span>
            </Link>
          </li>
        ))}
      </ul>
      {incomplete.length > limit && (
        <button
          type="button"
          onClick={() => setLimit((l) => l + PAGE)}
          className="min-h-10 cursor-pointer text-sm font-semibold text-heading underline underline-offset-2"
        >
          {STR.incomplete.showMore}
        </button>
      )}
    </div>
  );
}
