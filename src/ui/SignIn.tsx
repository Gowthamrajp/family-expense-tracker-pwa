/**
 * Sign-in screen (Req 1.1, 1.2, 1.4, 1.8, 1.9).
 *
 * `SignIn` is the public landing screen for an unauthenticated visitor. It:
 *
 * - presents a Google sign-in option (Req 1.1);
 * - invokes {@link useAuth}'s `signIn` when the option is selected, which
 *   initiates the Firebase Google authentication flow (Req 1.2);
 * - surfaces a sign-in error message when the most recent attempt failed or
 *   timed out. The {@link AuthProvider} maps both a genuine failure (Req 1.4)
 *   and a 60-second auth-flow timeout (Req 1.8) to `status === 'error'`, so a
 *   single error treatment covers both;
 * - shows nothing for a user cancellation: the provider returns `status` to
 *   `'unauthenticated'` silently in that case, so the screen simply renders its
 *   default state with no error (Req 1.9);
 * - disables the option and shows a pending state while a sign-in is in
 *   progress (`status === 'loading'`).
 *
 * When a Session becomes active (`status === 'authenticated'`) the screen
 * redirects to `/`; the {@link RequireAuth} guard otherwise handles routing for
 * protected paths.
 */
import { Navigate } from 'react-router-dom';

import { useAuth } from '../state/AuthProvider';
import { InstallInstructions } from './InstallInstructions';

/** Message shown when a sign-in attempt fails or times out (Req 1.4, 1.8). */
const SIGN_IN_ERROR_MESSAGE =
  'Sign-in could not be completed. Please try again.';

/**
 * Render the sign-in landing screen.
 */
export function SignIn(): JSX.Element {
  const { status, signIn } = useAuth();

  // A Session is active: leave the sign-in screen (Req 1.3 routing).
  if (status === 'authenticated') {
    return <Navigate to="/" replace />;
  }

  const isSigningIn = status === 'loading';
  const hasError = status === 'error';

  const handleSignIn = () => {
    // Fire-and-forget: the provider drives status transitions and the auth
    // listener establishes the Session on success.
    void signIn();
  };

  return (
    <main className="min-h-screen flex flex-col items-center justify-center gap-6 p-6 bg-surface-container-lowest">
      <div className="glass-card glass-card-hover w-full max-w-md p-card_padding flex flex-col items-center gap-5 text-center">
        <div>
          <h1 className="text-4xl font-extrabold tracking-tighter text-primary-container neon-glow">
            FamilyVault
          </h1>
          <p className="text-label-caps uppercase text-on-surface-variant mt-2">
            Family Expense Tracker
          </p>
        </div>

        <p className="text-on-surface-variant text-body-md">
          Sign in to record and review your family's expenses.
        </p>

        {hasError && (
          <p role="alert" className="text-error text-sm max-w-sm">
            {SIGN_IN_ERROR_MESSAGE}
          </p>
        )}

        <button
          type="button"
          onClick={handleSignIn}
          disabled={isSigningIn}
          aria-busy={isSigningIn}
          className="btn-primary w-full py-3 px-5 flex items-center justify-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            login
          </span>
          {isSigningIn ? 'Signing in…' : 'Sign in with Google'}
        </button>

        {/*
          Install affordance for unauthenticated visitors. On iOS Safari there is
          no automatic install popup (the platform does not support it), so we
          always offer manual "Add to Home Screen" steps here.
        */}
        <InstallInstructions />
      </div>
    </main>
  );
}
