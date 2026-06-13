/**
 * State-layer authentication provider.
 *
 * `AuthProvider` mediates between the UI and the {@link AuthService} data
 * adapter. It tracks the current Session, derives a `status`, and owns the two
 * authentication timers required by the spec:
 *
 * - a 60-second auth-flow timeout (Req 1.8): if a sign-in does not complete in
 *   time the attempt is abandoned with an error and no Session is retained;
 * - a 60-minute idle timeout (Req 1.10): user activity resets the timer and an
 *   expiry signs the member out.
 *
 * On Session termination (sign-out, idle timeout, or an auth change to `null`)
 * it increments a monotonically increasing `sessionEpoch` so that data hooks
 * such as `useExpenses` can observe the change and drop any in-memory expense
 * data held for the previous Session (Req 6.3).
 *
 * Timer durations and the underlying {@link AuthService} are injectable so the
 * provider can be unit-tested with fake timers and a mocked service.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  authService as defaultAuthService,
  isAuthCancellation,
  type AuthService,
} from '../data/authService';
import { resolveMemberLabel } from '../domain/member';
import type { FamilyMember } from '../domain/types';

/**
 * Lifecycle status of the authentication Session.
 *
 * - `loading`: the initial auth state has not yet been resolved.
 * - `authenticated`: a Family_Member is signed in.
 * - `unauthenticated`: no Session (signed out, cancelled, or never signed in).
 * - `error`: the most recent sign-in attempt failed or timed out (Req 1.4, 1.8).
 */
export type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

/** Value exposed by {@link AuthContext} to consumers via {@link useAuth}. */
export interface AuthContextValue {
  /** The signed-in member, or `null` when no Session is active. */
  member: FamilyMember | null;
  /** Derived Session lifecycle status. */
  status: AuthStatus;
  /**
   * Display label for the current member resolved via {@link resolveMemberLabel}
   * (`displayName ?? email ?? 'Signed in'`), or `null` when signed out (Req 1.5).
   */
  memberLabel: string | null;
  /**
   * Monotonic counter incremented on every Session termination. Data hooks can
   * treat a change in this value as the signal to clear in-memory data held for
   * the previous Session (Req 6.3).
   */
  sessionEpoch: number;
  /** Begin the Google sign-in flow (Req 1.2, 1.8, 1.9). */
  signIn: () => Promise<void>;
  /** End the current Session (Req 1.6). */
  signOut: () => Promise<void>;
}

/** Default auth-flow timeout: 60 seconds (Req 1.8). */
export const DEFAULT_AUTH_FLOW_TIMEOUT_MS = 60_000;

/** Default idle timeout: 60 minutes (Req 1.10). */
export const DEFAULT_IDLE_TIMEOUT_MS = 60 * 60 * 1_000;

/**
 * DOM events treated as Family_Member activity for the idle timer. Any of these
 * resets the 60-minute idle countdown while a Session is active (Req 1.10).
 */
const IDLE_ACTIVITY_EVENTS: readonly string[] = [
  'mousedown',
  'mousemove',
  'keydown',
  'touchstart',
  'scroll',
  'click',
];

const AuthContext = createContext<AuthContextValue | null>(null);

/** Props for {@link AuthProvider}. */
export interface AuthProviderProps {
  children: ReactNode;
  /** Auth adapter to use; defaults to the shared {@link authService}. */
  authService?: AuthService;
  /** Auth-flow timeout in milliseconds; defaults to 60 seconds (Req 1.8). */
  authFlowTimeoutMs?: number;
  /** Idle timeout in milliseconds; defaults to 60 minutes (Req 1.10). */
  idleTimeoutMs?: number;
}

/**
 * Provide authentication state and actions to descendants.
 *
 * @see useAuth for consuming the provided value.
 */
export function AuthProvider({
  children,
  authService = defaultAuthService,
  authFlowTimeoutMs = DEFAULT_AUTH_FLOW_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
}: AuthProviderProps): JSX.Element {
  const [member, setMember] = useState<FamilyMember | null>(null);
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [sessionEpoch, setSessionEpoch] = useState(0);

  // Tracks the member observed on the previous auth change so a transition to
  // `null` can be recognized as a Session termination (Req 6.3).
  const previousMemberRef = useRef<FamilyMember | null>(null);
  // Identifies the in-flight sign-in attempt so a resolution that arrives after
  // the auth-flow timeout (or a sign-out) is ignored (Req 1.8).
  const signInAttemptRef = useRef(0);
  const authFlowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearAuthFlowTimer = useCallback(() => {
    if (authFlowTimerRef.current !== null) {
      clearTimeout(authFlowTimerRef.current);
      authFlowTimerRef.current = null;
    }
  }, []);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current !== null) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  // Subscribe to auth-state changes for the provider's lifetime. This is the
  // single place that maps the member and derives `status`, and the single
  // place that detects Session termination to bump `sessionEpoch` (Req 6.3).
  useEffect(() => {
    const unsubscribe = authService.onAuthChanged((nextMember) => {
      const previousMember = previousMemberRef.current;
      previousMemberRef.current = nextMember;

      setMember(nextMember);

      if (nextMember !== null) {
        setStatus('authenticated');
        return;
      }

      // Transition to signed-out: terminate the Session and clear data.
      if (previousMember !== null) {
        setSessionEpoch((epoch) => epoch + 1);
      }
      // Preserve an `error` set by a failed sign-in; otherwise we are simply
      // unauthenticated (initial load, cancellation, sign-out, idle timeout).
      setStatus((current) => (current === 'error' ? 'error' : 'unauthenticated'));
    });

    return unsubscribe;
  }, [authService]);

  const signIn = useCallback(async () => {
    const attemptId = signInAttemptRef.current + 1;
    signInAttemptRef.current = attemptId;

    setStatus('loading');
    clearAuthFlowTimer();

    // Auth-flow timeout: abandon the attempt and surface a timeout error while
    // remaining unauthenticated (Req 1.8).
    authFlowTimerRef.current = setTimeout(() => {
      if (signInAttemptRef.current !== attemptId) {
        return;
      }
      // Invalidate the attempt so a late resolution is ignored.
      signInAttemptRef.current = attemptId + 1;
      authFlowTimerRef.current = null;
      setStatus('error');
    }, authFlowTimeoutMs);

    try {
      await authService.signInWithGoogle();
      // Superseded by a timeout or a newer attempt: ignore this resolution.
      if (signInAttemptRef.current !== attemptId) {
        return;
      }
      clearAuthFlowTimer();
      // On success the auth-state listener sets `member` and `authenticated`.
    } catch (error) {
      if (signInAttemptRef.current !== attemptId) {
        return;
      }
      clearAuthFlowTimer();
      if (isAuthCancellation(error)) {
        // User cancelled: return to sign-in silently, no error (Req 1.9).
        setStatus('unauthenticated');
      } else {
        // Genuine failure: show an error, retain no Session (Req 1.4).
        setStatus('error');
      }
    }
  }, [authService, authFlowTimeoutMs, clearAuthFlowTimer]);

  const signOut = useCallback(async () => {
    // Invalidate any in-flight sign-in and stop both timers before ending the
    // Session; the auth-state listener finalizes member/status/epoch.
    signInAttemptRef.current += 1;
    clearAuthFlowTimer();
    clearIdleTimer();
    await authService.signOut();
  }, [authService, clearAuthFlowTimer, clearIdleTimer]);

  // Idle timeout: only armed while a Session is active. Any activity resets the
  // countdown; expiry signs the member out (Req 1.10).
  useEffect(() => {
    if (status !== 'authenticated') {
      return;
    }

    const resetIdleTimer = () => {
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;
        void signOut();
      }, idleTimeoutMs);
    };

    resetIdleTimer();

    for (const eventName of IDLE_ACTIVITY_EVENTS) {
      window.addEventListener(eventName, resetIdleTimer, { passive: true });
    }

    return () => {
      for (const eventName of IDLE_ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, resetIdleTimer);
      }
      clearIdleTimer();
    };
  }, [status, idleTimeoutMs, clearIdleTimer, signOut]);

  // Final safety net: clear any pending timers when the provider unmounts.
  useEffect(() => {
    return () => {
      clearAuthFlowTimer();
      clearIdleTimer();
    };
  }, [clearAuthFlowTimer, clearIdleTimer]);

  const value = useMemo<AuthContextValue>(
    () => ({
      member,
      status,
      memberLabel: member ? resolveMemberLabel(member) : null,
      sessionEpoch,
      signIn,
      signOut,
    }),
    [member, status, sessionEpoch, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/**
 * Access the current {@link AuthContextValue}.
 *
 * @throws Error when called outside of an {@link AuthProvider}.
 */
export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (value === null) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return value;
}
