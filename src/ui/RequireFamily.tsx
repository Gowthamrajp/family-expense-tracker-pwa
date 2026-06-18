/**
 * Route guard enforcing family membership on the core app routes (Req 1.11,
 * 2.7).
 *
 * `RequireFamily` is mounted inside {@link RequireAuth}, so it only runs for an
 * authenticated member. It reads the membership status from {@link useFamily}
 * and:
 *
 * - while the member's family is still resolving (`status === 'loading'`),
 *   renders a minimal loading placeholder rather than redirecting, so a
 *   refreshed deep link is not bounced to `/family` before the family is
 *   resolved;
 * - when the member belongs to no family (`status === 'no-family'`), redirects
 *   to `/family` (the create-or-join screen), which is itself guarded by auth
 *   but NOT by this wrapper (Req 1.11, 2.7);
 * - when resolving the family failed (`status === 'error'`), renders a minimal
 *   inline error message rather than redirecting, to avoid a redirect loop with
 *   `/family`;
 * - when a family is resolved (`status === 'ready'`), renders the nested
 *   family-scoped routes via {@link Outlet}.
 *
 * Mirrors the structure of {@link RequireAuth}.
 */
import { Navigate, Outlet } from 'react-router-dom';

import { useFamily } from '../state/FamilyProvider';
import { Splash } from './Splash';

/**
 * Guard wrapper for routes that require both an active Session and family
 * membership. Intended to be used as a layout route nested under
 * {@link RequireAuth}, whose children are the family-scoped screens.
 */
export function RequireFamily(): JSX.Element {
  const { status } = useFamily();

  if (status === 'loading') {
    // Defer the redirect decision until the family is resolved (Req 1.11).
    return <Splash message="Loading your family…" />;
  }

  if (status === 'no-family') {
    // Authenticated but family-less: route to the create-or-join screen
    // (Req 1.11, 2.7).
    return <Navigate to="/family" replace />;
  }

  if (status === 'error') {
    // Resolving the family failed: show an inline error rather than redirecting
    // to /family, which would risk a redirect loop (Req 9.1).
    return (
      <div role="alert">
        Your family could not be loaded. Please try again.
      </div>
    );
  }

  return <Outlet />;
}
