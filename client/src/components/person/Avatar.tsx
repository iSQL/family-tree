import type { Gender } from '@shared/types';

export interface AvatarPerson {
  first_name: string;
  last_name: string;
  gender: Gender;
  photo_id: string | null;
}

const GENDER_BG: Record<Gender, string> = {
  M: 'bg-male',
  F: 'bg-female',
  U: 'bg-unknown',
};

function initials(p: AvatarPerson): string {
  const a = p.first_name.trim().charAt(0);
  const b = p.last_name.trim().charAt(0);
  return `${a}${b}`.toUpperCase() || '?';
}

/** Slika osobe (thumb) ili inicijali na rodnoj boji. */
export function Avatar({
  person,
  size = 40,
  className = '',
}: {
  person: AvatarPerson;
  size?: number;
  className?: string;
}) {
  if (person.photo_id) {
    return (
      <img
        src={`/api/photos/${encodeURIComponent(person.photo_id)}?size=thumb`}
        alt=""
        width={size}
        height={size}
        loading="lazy"
        className={`shrink-0 rounded-full bg-surface2 object-cover ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded-full font-display text-white select-none ${GENDER_BG[person.gender]} ${className}`}
      style={{ width: size, height: size, fontSize: Math.max(10, Math.round(size * 0.38)) }}
    >
      {initials(person)}
    </span>
  );
}
