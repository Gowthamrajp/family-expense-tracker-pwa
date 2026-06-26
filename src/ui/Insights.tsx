/**
 * Financial Insights section (rendered inline within the Dashboard).
 *
 * Shows, live from the family's expenses:
 * - the monthly budget progress card;
 * - a spending-trend line chart (month-on-month or year-on-year, optionally
 *   scoped to a category or sub-category).
 *
 * The per-category drill-down (sub-category split + transactions) opens from
 * the dashboard's spending chart; this section also offers a tap target for it.
 * Category ids are resolved to names via {@link useCategories}. Amounts honor
 * privacy mode through {@link Money}.
 */
import {
  computeBudgetStatus,
  effectiveMonthlyLimit,
} from '../domain/budget';
import {
  currentMonthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import { useAuth } from '../state/AuthProvider';
import { useBudget } from '../state/useBudget';
import { useCategories } from '../state/useCategories';
import { useExpenses } from '../state/useExpenses';
import { useSubCategories } from '../state/useSubCategories';
import { Loader } from './Loader';
import { BudgetProgressCard } from './BudgetProgressCard';
import { SpendingTrendCard } from './SpendingTrendCard';

/** Props for {@link Insights}. */
export interface InsightsProps {
  familyId?: string | null;
  active?: boolean;
}

/** Render the inline insights section (budget progress + spending trend). */
export function Insights({
  familyId = null,
  active = true,
}: InsightsProps = {}): JSX.Element {
  const { member } = useAuth();
  const { expenses, status, retry } = useExpenses(familyId, active);
  const { categories } = useCategories(familyId);
  const { subCategories } = useSubCategories(familyId);
  const { budget } = useBudget(familyId, member);

  const today = new Date();
  const curKey = currentMonthKey(today);
  const prevKey = previousMonthKey(today);
  const currentTotal = totalForMonth(expenses, curKey);
  const previousTotal = totalForMonth(expenses, prevKey);

  // Monthly budget: derive the effective limit from the previous month's spend
  // (percent mode) or the fixed amount, then current-month progress.
  const budgetLimit =
    budget === null ? null : effectiveMonthlyLimit(budget, previousTotal);
  const budgetProgress = computeBudgetStatus(currentTotal, budgetLimit);

  const hasExpenses = expenses.length > 0;

  return (
    <section
      data-screen="insights"
      aria-label="Financial insights"
      className="flex flex-col gap-4 md:gap-grid_gap"
    >
      {status === 'loading' && <Loader label="Loading insights…" block />}

      {status === 'error' && (
        <div role="alert" className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4">
          <p className="text-error">Insights could not be loaded.</p>
          <button type="button" onClick={retry} className="btn-ghost px-4 py-2 text-sm">
            Retry
          </button>
        </div>
      )}

      {hasExpenses && (
        <div className="grid grid-cols-12 gap-4 md:gap-grid_gap">
          {/* Monthly budget progress (Req: budget reflected in insights). */}
          <BudgetProgressCard
            budget={budget}
            progress={budgetProgress}
            currentTotal={currentTotal}
            previousTotal={previousTotal}
            monthKey={curKey}
          />

          {/* Spending trend over time (month-on-month / year-on-year), scoped
              to all spending, a category, or a sub-category. */}
          <div className="col-span-12">
            <SpendingTrendCard
              expenses={expenses}
              categories={categories}
              subCategories={subCategories}
            />
          </div>

          {/* Hint: tap the spending chart above (Category mode) to drill into a
              category's sub-category split and transactions. */}
          <div className="col-span-12 flex items-center gap-2 text-sm text-on-surface-variant px-1">
            <span className="material-symbols-outlined text-base text-primary-container" aria-hidden="true">
              touch_app
            </span>
            <span>Tap a category in the spending chart to see its sub-category split and transactions.</span>
          </div>
        </div>
      )}
    </section>
  );
}
