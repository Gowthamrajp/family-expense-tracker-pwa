/**
 * PWA registration status store + hook for the Family Expense Tracker.
 *
 * Surfaces whether the service-worker registration succeeded so the UI can
 * show a "service worker registration failed — offline capabilities
 * unavailable" message when it did not (Req 5.3). When registration fails the
 * app still operates by serving the shell directly from the network; this
 * store only drives the informational message.
 *
 * The state lives in a tiny module-level store rather than React context
 * because the registration outcome originates outside the React tree — in the
 * `registerPwa()` lifecycle hooks (`onRegisterError` / `onRegistered`) wired up
 * at app entry. A module store lets that non-React code publish the outcome
 * and lets any component subscribe via {@link usePwaStatus} without threading a
 * provider through the app.
 *
 * Wiring (the publisher side) is done in task 17.1 / alongside `registerPwa`:
 * - call {@link markPwaRegistered} from `registerPwa`'s `onRegistered` hook;
 * - call {@link markPwaRegistrationFailed} from its `onRegisterError` hook.
 *
 * TODO(task 17.1): in `src/main.tsx`, pass these setters into `registerPwa({
 * onRegistered, onRegisterError })` and render the failure message (e.g. in
 * `AppShell`) by reading {@link usePwaStatus}.
 */
import { useSyncExternalStore } from 'react';

/**
 * Lifecycle status of the service-worker registration.
 *
 * - `pending`: registration has been attempted but not yet resolved (or never
 *   attempted, e.g. service workers unsupported).
 * - `registered`: the service worker registered successfully (Req 5.2).
 * - `failed`: registration failed; offline capabilities are unavailable
 *   (Req 5.3).
 */
export type PwaRegistrationStatus = 'pending' | 'registered' | 'failed';

/** Snapshot of PWA registration state exposed to consumers. */
export interface PwaStatus {
  /** Current registration status. */
  registration: PwaRegistrationStatus;
  /**
   * `true` when offline capabilities are unavailable because service-worker
   * registration failed. Drives the Req 5.3 message.
   */
  offlineCapabilitiesUnavailable: boolean;
  /**
   * The last registration error, when {@link registration} is `failed`. Kept
   * for diagnostics/logging; the user-facing message does not depend on it.
   */
  error: unknown;
}

const PENDING_STATUS: PwaStatus = {
  registration: 'pending',
  offlineCapabilitiesUnavailable: false,
  error: undefined,
};

let currentStatus: PwaStatus = PENDING_STATUS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

function setStatus(next: PwaStatus): void {
  currentStatus = next;
  emit();
}

/**
 * Record that the service worker registered successfully (Req 5.2). Call this
 * from `registerPwa`'s `onRegistered` hook.
 */
export function markPwaRegistered(): void {
  setStatus({
    registration: 'registered',
    offlineCapabilitiesUnavailable: false,
    error: undefined,
  });
}

/**
 * Record that service-worker registration failed (Req 5.3). Call this from
 * `registerPwa`'s `onRegisterError` hook. The app keeps working from the
 * network; consumers should show the "offline capabilities unavailable"
 * message.
 *
 * @param error - The registration error, retained for diagnostics.
 */
export function markPwaRegistrationFailed(error?: unknown): void {
  setStatus({
    registration: 'failed',
    offlineCapabilitiesUnavailable: true,
    error,
  });
}

/**
 * Reset the store to its initial pending state. Primarily useful for tests.
 */
export function resetPwaStatus(): void {
  setStatus(PENDING_STATUS);
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function getSnapshot(): PwaStatus {
  return currentStatus;
}

/**
 * Subscribe to the PWA registration status.
 *
 * @returns The current {@link PwaStatus} snapshot; components re-render when it
 *   changes (e.g. when registration succeeds or fails).
 *
 * Validates: Requirements 5.3
 */
export function usePwaStatus(): PwaStatus {
  // `getSnapshot` is used for both client and server snapshots; the store is a
  // plain module singleton so the value is identical in either environment.
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
