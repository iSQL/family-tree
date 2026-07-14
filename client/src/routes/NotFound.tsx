import { Link } from 'react-router-dom';
import { STR } from '../lib/strings';

export default function NotFoundPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="font-display text-6xl text-faint">404</p>
      <p className="text-base text-muted">{STR.common.notFound}</p>
      <Link
        to="/"
        className="zb-label text-xs text-goldd underline underline-offset-2 hover:text-heading"
      >
        {STR.common.backToTree}
      </Link>
    </div>
  );
}
