/**
 * Route guard enforcing an active Session on protected routes (Req 1.7).
 *
 * `RequireAuth` reads the authentication status from {@link useAuth} and:
 *
 * - while the initial auth state is still resolving (`status === 'loading'`),
 *   renders a minimal loading placeholder rather than redirecting, so a
 *   refreshed deep link is not bounced to sign-in before Firebase reports the
 *   restored Session;
 * - when there is no active Session, redirects to `/signin`, preserving the
 *   attempted location so the app can return the member there after sign-in;
 * - when a Session is active, renders the nested protected routes via
 *   {@link Outlet}.
 */
import { Navigate, Outlet, useLocation } from 'react-router-dom';

import { useAuth } from '../state/AuthProvider';
import { Splash } from './Splash';

/**
 * Guard wrapper for protected routes. Intended to be used as a layout route
 * whose children are the authenticated screens.
 */
export function RequireAuth(): JSX.Element {
  const { status } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    // Defer the redirect decision until the Session is resolved (Req 1.7).
    return <Splash message="Starting up…" />;
  }

  if (status !== 'authenticated') {
    // No active Session: redirect unauthenticated access to sign-in (Req 1.7).
    return <Navigate to="/signin" replace state={{ from: location }} />;
  }

  return <Outlet />;
}
