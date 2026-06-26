/**
 * React hook exposing the active family's income list with live updates plus
 * add/update/delete actions. Mirrors {@link useExpenses}: while a Session is
 * active and a family is resolved, it subscribes to the Firestore listener via
 * {@link incomeRepository.subscribeToIncomes}, begins `loading`, transitions to
 * `ready` on the first snapshot, and reports `error` on listener failure while
 * retaining previously displayed data. A `retry` re-establishes the listener.
 */
import { useCallback, useEffect, useState } from 'react';

import { incomeRepository } from '../data/incomeRepository';
import { sortByDateDesc } from '../domain/sorting';
import type { Income, IncomeInput } from '../domain/types';
import { useAuth } from './AuthProvider';

/** Lifecycle status of the income subscription. */
export type IncomeStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useIncome}. */
export interface UseIncomeResult {
  /** Current income records, ordered by date most-recent first. */
  incomes: Income[];
  status: IncomeStatus;
  /** Re-attempt the subscription after a read failure. */
  retry: () => void;
  /** Persist a new income record. */
  addIncome: (input: IncomeInput) => Promise<string>;
  /** Update an existing income with re-validated fields. */
  updateIncome: (incomeId: string, input: IncomeInput) => Promise<void>;
  /** Delete an income record. */
  deleteIncome: (incomeId: string) => Promise<void>;
}

/**
 * Subscribe to the live, family-scoped income list while a Session is active.
 *
 * @param familyId The active family's id, or `null` to stay idle.
 * @param active Whether a Session is active. Defaults to `true`.
 */
export function useIncome(
  familyId: string | null,
  active: boolean = true,
): UseIncomeResult {
  const { member } = useAuth();

  const [incomes, setIncomes] = useState<Income[]>([]);
  const [status, setStatus] = useState<IncomeStatus>('loading');
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const retry = useCallback(() => {
    setSubscriptionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!active || familyId === null) {
      setStatus('loading');
      setIncomes([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = incomeRepository.subscribeToIncomes(
      familyId,
      (incoming) => {
        setIncomes(sortByDateDesc(incoming));
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsubscribe;
  }, [familyId, active, subscriptionAttempt]);

  const addIncome = useCallback(
    async (input: IncomeInput): Promise<string> => {
      if (familyId === null) {
        throw new Error('Cannot add income without an active family.');
      }
      if (member === null) {
        throw new Error('Cannot add income without an authenticated member.');
      }
      return incomeRepository.addIncome(familyId, input, member);
    },
    [familyId, member],
  );

  const updateIncome = useCallback(
    async (incomeId: string, input: IncomeInput): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot update income without an active family.');
      }
      if (member === null) {
        throw new Error('Cannot update income without an authenticated member.');
      }
      await incomeRepository.updateIncome(familyId, incomeId, input, member);
    },
    [familyId, member],
  );

  const deleteIncome = useCallback(
    async (incomeId: string): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot delete income without an active family.');
      }
      await incomeRepository.deleteIncome(familyId, incomeId);
    },
    [familyId],
  );

  return { incomes, status, retry, addIncome, updateIncome, deleteIncome };
}
