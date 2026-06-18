/**
 * Derive the current-month budget status from the family's budget and expenses.
 *
 * Combines {@link useBudget} (the configured monthly target) with
 * {@link useExpenses} (actual spend) and the pure helpers in
 * {@link ../domain/budget} to produce a ready-to-render {@link BudgetStatus} for
 * the current calendar month, plus the previous-month baseline used by
 * percent-mode budgets.
 *
 * It is intentionally read-only and side-effect free so multiple screens
 * (entry form, insights, dashboard) can consume the same computed status.
 */
import { useMemo } from 'react';

import { useAuth } from './AuthProvider';
import { useBudget } from './useBudget';
import { useExpenses } from './useExpenses';
import {
  computeBudgetStatus,
  effectiveMonthlyLimit,
  type BudgetStatus as BudgetProgress,
} from '../domain/budget';
import {
  currentMonthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import type { Budget } from '../domain/types';

/** Combined result of {@link useBudgetStatus}. */
export interface UseBudgetStatusResult {
  /** The configured budget, or null when none is set. */
  budget: Budget | null;
  /** Current-month progress against the effective limit. */
  progress: BudgetProgress;
  /** Total spent this calendar month. */
  currentTotal: number;
  /** Total spent last calendar month (the percent-mode baseline). */
  previousTotal: number;
  /** True once both budget and expense subscriptions have data ready. */
  ready: boolean;
}

/**
 * Compute the current-month budget status for the given family.
 *
 * @param familyId The active family's id, or `null` to stay idle.
 * @param active Whether the expense subscription should be active.
 */
export function useBudgetStatus(
  familyId: string | null,
  active = true,
): UseBudgetStatusResult {
  const { member } = useAuth();
  const { budget, status: budgetStatus } = useBudget(familyId, member);
  const { expenses, status: expensesStatus } = useExpenses(familyId, active);

  return useMemo(() => {
    const today = new Date();
    const curKey = currentMonthKey(today);
    const prevKey = previousMonthKey(today);
    const currentTotal = totalForMonth(expenses, curKey);
    const previousTotal = totalForMonth(expenses, prevKey);

    const limit =
      budget === null ? null : effectiveMonthlyLimit(budget, previousTotal);
    const progress = computeBudgetStatus(currentTotal, limit);

    return {
      budget,
      progress,
      currentTotal,
      previousTotal,
      ready: budgetStatus === 'ready' && expensesStatus !== 'loading',
    };
  }, [budget, expenses, budgetStatus, expensesStatus]);
}
