/**
 * React hook that exposes the family group's expense list with live updates.
 *
 * While a Session is active, the hook subscribes to the Firestore real-time
 * listener via {@link expenseRepository.subscribeToExpenses}. It begins in a
 * `loading` state, transitions to `ready` on the first snapshot, and surfaces
 * an `error` status on listener failure while retaining any previously
 * displayed data so the list/dashboard are not blanked out (Req 3.8, 4.7).
 *
 * The returned `retry` re-establishes the subscription so the UI can recover
 * from a transient read failure (Req 3.9, 4.7).
 *
 * Subscription is gated on an `active` flag (typically "a Session is active").
 * Coupling to the auth layer is intentionally loose: callers pass `active`
 * rather than this hook reaching into an auth context, so it can be used and
 * tested independently.
 */
import { useCallback, useEffect, useState } from 'react';

import { expenseRepository } from '../data/expenseRepository';
import { sortByDateDesc } from '../domain/sorting';
import type { Expense } from '../domain/types';

/** Lifecycle status of the expense subscription. */
export type ExpensesStatus = 'loading' | 'ready' | 'error';

/**
 * Result returned by {@link useExpenses}. Mirrors the design's
 * `UseExpensesResult` contract.
 */
export interface UseExpensesResult {
  /** Current expenses, ordered by Expense date most-recent first. */
  expenses: Expense[];
  /** Subscription status: loading, ready, or error. */
  status: ExpensesStatus;
  /** Re-attempt the subscription after a read failure (Req 3.9, 4.7). */
  retry: () => void;
}

/**
 * Subscribe to the live expense list while a Session is active.
 *
 * @param active - Whether a Session is active. When `false`, the hook does not
 *   subscribe and reports `loading` with no data. Defaults to `true`.
 * @returns The current expenses, subscription status, and a `retry` control.
 *
 * Validates: Requirements 3.1, 3.5, 3.8, 3.9, 4.5, 4.7
 */
export function useExpenses(active: boolean = true): UseExpensesResult {
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [status, setStatus] = useState<ExpensesStatus>('loading');

  // Bumping this forces the subscription effect to re-run, which re-attempts
  // the Firestore listener after a failure (the `retry` control).
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const retry = useCallback(() => {
    setSubscriptionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!active) {
      // No active Session: do not subscribe. Reset to the initial loading
      // state so stale data is not surfaced once a Session ends.
      setStatus('loading');
      setExpenses([]);
      return;
    }

    // Each (re)subscription starts in the loading state.
    setStatus('loading');

    const unsubscribe = expenseRepository.subscribeToExpenses(
      (incoming) => {
        // onSnapshot already orders by date desc; sort defensively to keep the
        // list ordered regardless of source ordering (Req 3.4, 3.5).
        setExpenses(sortByDateDesc(incoming));
        setStatus('ready');
      },
      () => {
        // Retain previously displayed data on error (Req 3.8, 4.7); only the
        // status changes so the UI can show an error message + retry control.
        setStatus('error');
      },
    );

    // Clean up on unmount and before re-subscribing (retry / active change).
    return unsubscribe;
  }, [active, subscriptionAttempt]);

  return { expenses, status, retry };
}
