import { Link } from 'react-router-dom';
import { STR } from '../lib/strings';

export default function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-bold text-stone-300 dark:text-stone-600">404</p>
      <p className="text-sm text-stone-600 dark:text-stone-300">{STR.common.notFound}</p>
      <Link
        to="/"
        className="text-sm font-medium text-amber-700 underline underline-offset-2 hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
      >
        {STR.common.backToTree}
      </Link>
    </div>
  );
}
