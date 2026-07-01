/**
 * Per-category / per-sub-category budget progress for the dashboard.
 *
 * The overall {@link BudgetProgressCard} only reflects the family-wide budget.
 * Members can also set caps on individual categories and sub-categories in
 * Family settings; this card surfaces those so a budget set at any scope shows
 * up on the dashboard with its current-month progress.
 *
 * For each scoped budget it derives the effective monthly limit (fixed amount,
 * or a percent of that scope's previous-month spend), the current-month spend,
 * and a color-coded progress bar — reusing the pure budget helpers.
 */
import { useMemo } from 'react';

import {
  computeBudgetStatus,
  effectiveLimit,
  scopedTotalForMonth,
  type BudgetState,
} from '../domain/budget';
import { currentMonthKey, monthKey, previousMonthKey } from '../domain/insights';
import type { Expense, ScopedBudget } from '../domain/types';
import { Money, formatINR } from './Money';

/** Bar/text color per budget state. */
const STATE_STYLE: Record<BudgetState, { bar: string; text: string }> = {
  under: { bar: 'bg-primary-container', text: 'text-primary-container' },
  warning: { bar: 'bg-amber-400', text: 'text-amber-400' },
  over: { bar: 'bg-error', text: 'text-error' },
};

/** Props for {@link ScopedBudgetsCard}. */
export interface ScopedBudgetsCardProps {
  scopedBudgets: ScopedBudget[];
  expenses: Expense[];
  categoryNameById: Map<string, string>;
  subCategoryNameById: Map<string, string>;
}

/** Render the per-category/sub-category budget progress list. */
export function ScopedBudgetsCard({
  scopedBudgets,
  expenses,
  categoryNameById,
  subCategoryNameById,
}: ScopedBudgetsCardProps): JSX.Element | null {
  const rows = useMemo(() => {
    const today = new Date();
    const curKey = currentMonthKey(today);
    const prevKey = previousMonthKey(today);

    return scopedBudgets
      .map((b) => {
        const isSub = b.scopeType === 'subCategory';
        const predicate = isSub
          ? (e: { subCategoryId?: string }) => e.subCategoryId === b.scopeId
          : (e: { categoryId?: string }) => e.categoryId === b.scopeId;
        const name = isSub
          ? subCategoryNameById.get(b.scopeId) ?? 'Sub-category'
          : categoryNameById.get(b.scopeId) ?? 'Category';
        const prevSpend = scopedTotalForMonth(expenses, monthKey, prevKey, predicate);
        const limit = effectiveLimit(b.mode, b.amount, b.percent, prevSpend);
        const spent = scopedTotalForMonth(expenses, monthKey, curKey, predicate);
        const status = computeBudgetStatus(spent, limit);
        return { id: b.id, name, isSub, status };
      })
      // Only show budgets with a usable limit; sort over-budget first, then by usage.
      .filter((r) => r.status.limit !== null && r.status.limit > 0)
      .sort((a, b) => (b.status.fraction ?? 0) - (a.status.fraction ?? 0));
  }, [scopedBudgets, expenses, categoryNameById, subCategoryNameById]);

  if (rows.length === 0) {
    return null;
  }

  return (
    <div
      className="col-span-12 glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      data-testid="scoped-budgets-card"
    >
      <h2 className="text-headline-md font-semibold text-on-surface">Category budgets</h2>
      <ul className="flex flex-col gap-4">
        {rows.map((row) => {
          const style = STATE_STYLE[row.status.state];
          const pct =
            row.status.fraction === null ? 0 : Math.min(row.status.fraction * 100, 100);
          return (
            <li key={row.id} className="flex flex-col gap-1.5" data-testid="scoped-budget-row">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm text-on-surface inline-flex items-center gap-1.5 min-w-0">
                  {row.isSub && (
                    <span className="material-symbols-outlined text-sm text-on-surface-variant shrink-0" aria-hidden="true">
                      subdirectory_arrow_right
                    </span>
                  )}
                  <span className="truncate">{row.name}</span>
                </span>
                <span className="font-mono-data text-sm shrink-0">
                  <Money amount={row.status.spent} className={style.text} />
                  <span className="text-on-surface-variant">
                    {' '}/ {formatINR(row.status.limit ?? 0)}
                  </span>
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                <div
                  className={`h-full rounded-full transition-[width] duration-500 ${style.bar}`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
