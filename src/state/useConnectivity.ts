/**
 * Connectivity state hook for the Family Expense Tracker PWA.
 *
 * Tracks the device's online/offline status so the UI can render the cached
 * application shell with a "data requires a network connection" banner while
 * offline, and remove it (reloading expense data) on reconnect.
 *
 * Design mapping (see design.md "PWA / connectivity errors"):
 * - Offline state via the `offline`/`online` events shows the banner over the
 *   cached shell (Req 5.6).
 * - On reconnect the banner is removed and expense data is (re)loaded within
 *   the time bound (Req 5.7).
 *
 * Coupling is intentionally loose: this hook owns no Firestore knowledge. The
 * expense subscription used by `useExpenses` is a Firestore `onSnapshot`
 * listener, which transparently reconnects and re-delivers data when the
 * network returns — so for the common case no explicit refetch is required.
 * To support consumers that DO need to force a refresh (e.g. a one-shot read
 * path, or to guarantee freshness within the Req 5.7 bound), this hook exposes
 * a `reconnectedAt` timestamp that flips each time the device transitions from
 * offline back to online. A consumer can watch that value (for example in a
 * `useEffect` dependency) and call its own `retry()` to re-trigger a load.
 *
 * TODO(task 17.1): consume `useConnectivity` in the app entry / `AppShell`
 * wiring — pass `isOffline` into `AppShell` (whose banner placeholder already
 * reads it, Req 5.6) and use `reconnectedAt`/`onReconnect` to re-trigger
 * `useExpenses().retry()` on reconnect so data reloads within 10 seconds
 * (Req 5.7).
 */
import { useEffect, useRef, useState } from 'react';

/** Result returned by {@link useConnectivity}. */
export interface UseConnectivityResult {
  /**
   * `true` while the device reports no network connection. Drives the
   * `AppShell` offline banner (Req 5.6).
   */
  isOffline: boolean;
  /**
   * Timestamp (ms since epoch) of the most recent offline→online transition,
   * or `null` if no reconnect has happened during this hook's lifetime. The
   * value strictly increases on each reconnect, so it is safe to use as a
   * `useEffect` dependency to re-trigger a data reload on reconnect (Req 5.7).
   */
  reconnectedAt: number | null;
}

/**
 * Read the current navigator online status without throwing in non-browser
 * (SSR / test) environments where `navigator` may be undefined.
 */
function readIsOffline(): boolean {
  if (typeof navigator === 'undefined' || typeof navigator.onLine !== 'boolean') {
    // Assume online when we cannot tell; the banner is a usability aid, not a
    // security boundary, and a false "offline" would be misleading.
    return false;
  }
  return !navigator.onLine;
}

/**
 * Options for {@link useConnectivity}.
 */
export interface UseConnectivityOptions {
  /**
   * Optional callback invoked on each offline→online transition. Useful for
   * imperatively re-triggering a data reload (e.g. `useExpenses().retry()`)
   * on reconnect (Req 5.7). Kept optional so the hook stays loosely coupled.
   */
  onReconnect?: () => void;
}

/**
 * Subscribe to the device's connectivity state.
 *
 * Listens for the window `online`/`offline` events and tracks the derived
 * `isOffline` flag plus a `reconnectedAt` timestamp that updates on each
 * reconnect.
 *
 * @param options - Optional `onReconnect` callback fired on offline→online.
 * @returns The current `{ isOffline, reconnectedAt }` connectivity state.
 *
 * Validates: Requirements 5.6, 5.7
 */
export function useConnectivity(
  options: UseConnectivityOptions = {},
): UseConnectivityResult {
  const [isOffline, setIsOffline] = useState<boolean>(readIsOffline);
  const [reconnectedAt, setReconnectedAt] = useState<number | null>(null);

  // Keep the latest callback in a ref so changing it between renders does not
  // force the event listeners to be torn down and re-added.
  const onReconnectRef = useRef(options.onReconnect);
  onReconnectRef.current = options.onReconnect;

  // Track the previous offline state so we only fire reconnect side effects on
  // a genuine offline→online transition (not on the initial online render).
  const wasOfflineRef = useRef<boolean>(isOffline);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    const handleOnline = () => {
      setIsOffline(false);
      if (wasOfflineRef.current) {
        // Genuine reconnect: flip the timestamp and notify the consumer so the
        // banner clears and expense data can reload (Req 5.7).
        wasOfflineRef.current = false;
        setReconnectedAt(Date.now());
        onReconnectRef.current?.();
      }
    };

    const handleOffline = () => {
      wasOfflineRef.current = true;
      setIsOffline(true);
    };

    // Reconcile against the current status in case it changed between the
    // initial render and effect attachment.
    const currentlyOffline = readIsOffline();
    wasOfflineRef.current = currentlyOffline;
    setIsOffline(currentlyOffline);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  return { isOffline, reconnectedAt };
}
