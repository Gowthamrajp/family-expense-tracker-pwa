/**
 * Member avatar component.
 *
 * Renders a member's profile photo (e.g. their Google account photo) in a
 * circular mask with the FamilyVault neon-cyan ring. When no photo is available
 * — or the image fails to load — it falls back to a monogram derived from the
 * member's display name/email, or a generic account icon as a last resort.
 *
 * Purely presentational; callers pass the resolved identity fields.
 */
import { useState } from 'react';

/** Props for {@link Avatar}. */
export interface AvatarProps {
  /** Profile photo URL, or null/undefined when none is available. */
  photoURL?: string | null;
  /** Display name used for the monogram fallback and alt text. */
  displayName?: string | null;
  /** Email used for the monogram/alt fallback when no display name exists. */
  email?: string | null;
  /** Pixel size of the (square) avatar. Defaults to 40. */
  size?: number;
  /** When true, render the neon-cyan active-contributor ring. Defaults to true. */
  ring?: boolean;
  /** Extra classes for the outer element. */
  className?: string;
}

/** Derive a 1–2 character monogram from a name or email. */
function monogram(displayName?: string | null, email?: string | null): string {
  const name = (displayName ?? '').trim();
  if (name.length > 0) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return name.slice(0, 2).toUpperCase();
  }
  const mail = (email ?? '').trim();
  if (mail.length > 0) {
    return mail.slice(0, 2).toUpperCase();
  }
  return '';
}

/**
 * Render a circular member avatar with photo, monogram, or icon fallback.
 */
export function Avatar({
  photoURL,
  displayName,
  email,
  size = 40,
  ring = true,
  className = '',
}: AvatarProps): JSX.Element {
  // Track whether the <img> failed so we can fall back without leaving a broken
  // image. Reset is unnecessary: a changed URL remounts via the key below.
  const [failed, setFailed] = useState(false);

  const label = (displayName ?? email ?? 'Member').trim() || 'Member';
  const initials = monogram(displayName, email);
  const ringClass = ring
    ? 'ring-2 ring-primary-container ring-offset-2 ring-offset-surface-container-lowest'
    : '';
  const dimension = { width: size, height: size } as const;

  const showPhoto = typeof photoURL === 'string' && photoURL !== '' && !failed;

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full overflow-hidden bg-surface-container-high text-primary-container ${ringClass} ${className}`}
      style={dimension}
      aria-hidden={false}
      aria-label={label}
      title={label}
    >
      {showPhoto ? (
        <img
          key={photoURL}
          src={photoURL ?? undefined}
          alt={label}
          referrerPolicy="no-referrer"
          className="w-full h-full object-cover"
          onError={() => setFailed(true)}
        />
      ) : initials !== '' ? (
        <span
          className="font-semibold leading-none"
          style={{ fontSize: Math.max(10, Math.round(size * 0.4)) }}
        >
          {initials}
        </span>
      ) : (
        <span
          className="material-symbols-outlined"
          style={{ fontSize: Math.round(size * 0.6) }}
          aria-hidden="true"
        >
          account_circle
        </span>
      )}
    </span>
  );
}
