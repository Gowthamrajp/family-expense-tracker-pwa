/**
 * React hook that exposes the active family's expense list with live updates.
 *
 * While a Session is active and a family is resolved, the hook subscribes to
 * the Firestore real-time listener via
 * {@link expenseRepository.subscribeToExpenses}, scoped to the family id. It
 * begins in a `loading` state, transitions to `ready` on the first snapshot,
 * and surfaces an `error` status on listener failure while retaining any
 * previously displayed data so the list/dashboard are not blanked out
 * (Req 3.8, 4.7).
 *
 * The returned `retry` re-establishes the subscription so the UI can recover
 * from a transient read failure (Req 3.9, 4.7).
 *
 * Subscription is gated on both an `active` flag (typically "a Session is
 * active") and a non-null `familyId`. Coupling to the auth/family layers is
 * intentionally loose: callers pass `familyId`/`active` rather than this hook
 * reaching into a context, so it can be used and tested independently.
 *
 * NOTE (tasks 28.4/31): `familyId` is supplied by the caller. Until the
 * `FamilyProvider`/`useFamily` wiring lands (task 28.4) and routing is
 * finalized (task 31), the screen call sites pass `null`, which keeps the hook
 * idle (no subscription).
 */
import { useCallback, useEffect, useState } from 'react';

import { expenseRepository } from '../data/expenseRepository';
import { sortByDateDesc } from '../domain/sorting';
import type { Expense, ExpenseInput } from '../domain/types';
import { useAuth } from './AuthProvider';

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
  /**
   * Update an existing expense with re-validated fields, delegating to the
   * family-scoped {@link expenseRepository} with the active `familyId` and the
   * current `member`. Any member of the family may edit any expense (Req 3.19);
   * the repository preserves the original recorder/creation time and stamps
   * `updatedBy`/`updatedAt`. The live subscription reflects the result, so
   * callers do not manually refresh (Req 3.14, 3.15).
   */
  updateExpense: (expenseId: string, input: ExpenseInput) => Promise<void>;
  /**
   * Delete an expense from the active family, delegating to the family-scoped
   * {@link expenseRepository}. Any member of the family may delete any expense
   * (Req 3.18, 3.19). The live subscription reflects the result.
   */
  deleteExpense: (expenseId: string) => Promise<void>;
}

/**
 * Subscribe to the live, family-scoped expense list while a Session is active.
 *
 * @param familyId - The active family's id. When `null`, the hook does not
 *   subscribe and reports `loading` with no data. (Supplied by `useFamily` once
 *   task 28.4 wires it; call sites currently pass `null`.)
 * @param active - Whether a Session is active. When `false`, the hook does not
 *   subscribe and reports `loading` with no data. Defaults to `true`.
 * @returns The current expenses, subscription status, a `retry` control, and
 *   `updateExpense`/`deleteExpense` actions.
 *
 * Validates: Requirements 3.1, 3.5, 3.8, 3.9, 3.14, 3.15, 3.18, 3.19, 4.5, 4.7, 6.1, 6.5
 */
export function useExpenses(
  familyId: string | null,
  active: boolean = true,
): UseExpensesResult {
  const { member } = useAuth();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [status, setStatus] = useState<ExpensesStatus>('loading');

  // Bumping this forces the subscription effect to re-run, which re-attempts
  // the Firestore listener after a failure (the `retry` control).
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const retry = useCallback(() => {
    setSubscriptionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!active || familyId === null) {
      // No active Session or no resolved family: do not subscribe. Reset to the
      // initial loading state so stale data is not surfaced once a Session ends
      // or the family changes.
      setStatus('loading');
      setExpenses([]);
      return;
    }

    // Each (re)subscription starts in the loading state.
    setStatus('loading');

    const unsubscribe = expenseRepository.subscribeToExpenses(
      familyId,
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
  }, [familyId, active, subscriptionAttempt]);

  const updateExpense = useCallback(
    async (expenseId: string, input: ExpenseInput): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot update an expense without an active family.');
      }
      if (member === null) {
        throw new Error('Cannot update an expense without an authenticated member.');
      }
      // Delegate to the family-scoped repository with the active familyId and
      // the current member so it can stamp `updatedBy`. The live subscription
      // reflects the edit; no manual refresh is needed (Req 3.14, 3.15, 3.19).
      await expenseRepository.updateExpense(familyId, expenseId, input, member);
    },
    [familyId, member],
  );

  const deleteExpense = useCallback(
    async (expenseId: string): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot delete an expense without an active family.');
      }
      // Any member of the family may delete any expense (Req 3.18, 3.19). The
      // live subscription reflects the removal; no manual refresh is needed.
      await expenseRepository.deleteExpense(familyId, expenseId);
    },
    [familyId],
  );

  return { expenses, status, retry, updateExpense, deleteExpense };
}
