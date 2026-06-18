/**
 * React hook exposing the active family's monthly budget with live updates and
 * validated set/clear actions.
 *
 * While a family is resolved, the hook subscribes to the budget document via
 * {@link budgetRepository.subscribeToBudget}. It begins `loading`, transitions
 * to `ready` on the first snapshot (with `budget` either set or `null`), and
 * reports `error` on listener failure. When `familyId` is `null` the hook stays
 * idle and `setBudget` resolves to an error without writing.
 *
 * `setBudget` validates the raw value for the chosen mode via
 * {@link validateBudgetValue} before writing, so an empty/non-numeric/out-of-
 * range value is never persisted.
 */
import { useCallback, useEffect, useState } from 'react';

import { budgetRepository } from '../data/budgetRepository';
import { validateBudgetValue, type BudgetError } from '../domain/budget';
import type { Budget, BudgetMode, FamilyMember, Result } from '../domain/types';
import { err, ok } from '../domain/types';

/** Lifecycle status of the budget subscription. */
export type BudgetStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useBudget}. */
export interface UseBudgetResult {
  /** The family's budget, or null when none is set. */
  budget: Budget | null;
  status: BudgetStatus;
  /**
   * Validate and persist the family's monthly budget. `rawValue` is parsed for
   * the given `mode`; an invalid value returns `err` without writing.
   */
  setBudget(
    mode: BudgetMode,
    rawValue: string,
  ): Promise<Result<void, BudgetError>>;
  /** Remove the family's budget. */
  clearBudget(): Promise<void>;
}

/**
 * Subscribe to the live, family-scoped monthly budget and expose set/clear.
 *
 * @param familyId The active family's id, or `null` to stay idle.
 * @param member The current member, attributed as the budget's last editor.
 */
export function useBudget(
  familyId: string | null,
  member: FamilyMember | null,
): UseBudgetResult {
  const [budget, setBudgetState] = useState<Budget | null>(null);
  const [status, setStatus] = useState<BudgetStatus>('loading');

  useEffect(() => {
    if (familyId === null) {
      setStatus('loading');
      setBudgetState(null);
      return;
    }
    setStatus('loading');
    const unsubscribe = budgetRepository.subscribeToBudget(
      familyId,
      (incoming) => {
        setBudgetState(incoming);
        setStatus('ready');
      },
      () => {
        setStatus('error');
      },
    );
    return unsubscribe;
  }, [familyId]);

  const setBudget = useCallback(
    async (
      mode: BudgetMode,
      rawValue: string,
    ): Promise<Result<void, BudgetError>> => {
      const validation = validateBudgetValue(mode, rawValue);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null || member === null) {
        return err({ kind: 'required' });
      }
      await budgetRepository.setBudget(familyId, {
        mode,
        ...(mode === 'amount'
          ? { amount: validation.value }
          : { percent: validation.value }),
        updatedBy: member.uid,
      });
      return ok(undefined);
    },
    [familyId, member],
  );

  const clearBudget = useCallback(async (): Promise<void> => {
    if (familyId === null) {
      return;
    }
    await budgetRepository.clearBudget(familyId);
  }, [familyId]);

  return { budget, status, setBudget, clearBudget };
}
