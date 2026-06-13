/**
 * Authentication adapter wrapping Firebase Authentication (Google sign-in).
 *
 * This is the only module besides {@link ./firebase} that imports the Firebase
 * Auth SDK; the state layer (`AuthProvider`) consumes this adapter through the
 * {@link AuthService} interface so it never depends on Firebase types directly.
 *
 * The adapter maps Firebase {@link User} objects to the domain
 * {@link FamilyMember} model and classifies sign-in rejections so the state
 * layer can surface a user cancellation silently (Req 1.9) while showing an
 * error message for genuine failures (Req 1.4).
 */
import {
  signInWithPopup,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type Auth,
  type User,
  type Unsubscribe as FirebaseUnsubscribe,
} from 'firebase/auth';

import { auth, googleAuthProvider } from './firebase';
import type { FamilyMember } from '../domain/types';

/**
 * Unsubscribe callback returned by subscription APIs. Calling it detaches the
 * associated listener. Structurally identical to the Firebase `Unsubscribe`
 * type but declared here so consumers do not import the Firebase SDK.
 */
export type Unsubscribe = () => void;

/**
 * Authentication operations consumed by the state layer.
 * See design "Data Layer / authService.ts".
 */
export interface AuthService {
  /**
   * Begins the Google sign-in popup flow. Resolves with the signed-in
   * {@link FamilyMember} on success; rejects on failure or user cancellation.
   * Cancellation rejections satisfy {@link isAuthCancellation}.
   */
  signInWithGoogle(): Promise<FamilyMember>;
  /** Ends the current Session. */
  signOut(): Promise<void>;
  /**
   * Subscribes to auth-state changes; the listener is invoked with the mapped
   * {@link FamilyMember} or `null` on every change. Returns an
   * {@link Unsubscribe} that detaches the listener.
   */
  onAuthChanged(listener: (member: FamilyMember | null) => void): Unsubscribe;
  /** Returns the current member synchronously, or `null` when signed out. */
  getCurrentMember(): FamilyMember | null;
}

/**
 * Firebase Auth error codes that indicate the user dismissed or cancelled the
 * sign-in flow rather than a genuine failure. These should be surfaced
 * silently by the UI (Req 1.9).
 */
const CANCELLATION_ERROR_CODES: ReadonlySet<string> = new Set([
  'auth/popup-closed-by-user',
  'auth/cancelled-popup-request',
  'auth/user-cancelled',
]);

/**
 * Error thrown (via rejection) when the user cancels the Google sign-in flow.
 * The state layer can detect this case with {@link isAuthCancellation} and
 * return to the sign-in screen without showing an error (Req 1.9).
 */
export class AuthCancellationError extends Error {
  /** Discriminator flag for structural detection across module boundaries. */
  readonly isAuthCancellation = true as const;
  /** The originating Firebase error code, when available. */
  readonly code?: string;

  constructor(message = 'Google sign-in was cancelled.', code?: string) {
    super(message);
    this.name = 'AuthCancellationError';
    this.code = code;
  }
}

/**
 * Determine whether a rejection reason represents a user-initiated
 * cancellation of the sign-in flow (Req 1.9) as opposed to a genuine failure
 * (Req 1.4).
 *
 * @param error the rejection reason from {@link AuthService.signInWithGoogle}
 * @returns `true` when the error is a cancellation, otherwise `false`
 */
export function isAuthCancellation(error: unknown): boolean {
  if (error instanceof AuthCancellationError) {
    return true;
  }
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { isAuthCancellation?: unknown; code?: unknown };
    if (candidate.isAuthCancellation === true) {
      return true;
    }
    if (typeof candidate.code === 'string' && CANCELLATION_ERROR_CODES.has(candidate.code)) {
      return true;
    }
  }
  return false;
}

/**
 * Map a Firebase {@link User} to the domain {@link FamilyMember} model,
 * keeping the data layer the only place aware of the Firebase user shape.
 *
 * @param user the authenticated Firebase user
 * @returns the corresponding family member
 */
function toFamilyMember(user: User): FamilyMember {
  return {
    uid: user.uid,
    displayName: user.displayName,
    email: user.email,
  };
}

/**
 * Extract a string `code` from an unknown rejection reason, if present.
 */
function errorCode(error: unknown): string | undefined {
  if (typeof error === 'object' && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === 'string') {
      return code;
    }
  }
  return undefined;
}

/**
 * Create an {@link AuthService} bound to the given Firebase {@link Auth}
 * instance. Defaults to the shared app `auth` instance; an explicit instance
 * can be supplied for testing.
 *
 * @param authInstance the Firebase Auth instance to wrap
 * @returns an auth service implementation
 */
export function createAuthService(authInstance: Auth = auth): AuthService {
  return {
    async signInWithGoogle(): Promise<FamilyMember> {
      try {
        const credential = await signInWithPopup(authInstance, googleAuthProvider);
        return toFamilyMember(credential.user);
      } catch (error) {
        const code = errorCode(error);
        if (code !== undefined && CANCELLATION_ERROR_CODES.has(code)) {
          throw new AuthCancellationError(
            'Google sign-in was cancelled.',
            code,
          );
        }
        throw error;
      }
    },

    signOut(): Promise<void> {
      return firebaseSignOut(authInstance);
    },

    onAuthChanged(listener: (member: FamilyMember | null) => void): Unsubscribe {
      const unsubscribe: FirebaseUnsubscribe = onAuthStateChanged(
        authInstance,
        (user) => {
          listener(user ? toFamilyMember(user) : null);
        },
      );
      return unsubscribe;
    },

    getCurrentMember(): FamilyMember | null {
      const user = authInstance.currentUser;
      return user ? toFamilyMember(user) : null;
    },
  };
}

/** Default auth service bound to the shared Firebase app instance. */
export const authService: AuthService = createAuthService();
