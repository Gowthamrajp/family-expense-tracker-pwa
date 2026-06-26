/**
 * Dashboard screen (Req 4.1–4.7).
 *
 * `Dashboard` presents aggregated spending for the family group, retrieved
 * live via {@link useExpenses}. The hook subscribes to the Firestore real-time
 * listener while a Session is active and surfaces loading/ready/error status
 * with a `retry` control; visualizations therefore update automatically as the
 * underlying data changes, with no manual reload (Req 4.5).
 *
 * Rendered content:
 *
 * - The grand total expense amount, summed across all recorded expenses and
 *   formatted as currency (Req 4.1).
 * - A bar chart of total amount grouped by Category, one bar per Category with
 *   at least one expense (Req 4.2).
 * - A bar chart of total amount grouped by Source, one bar per Source with at
 *   least one expense (Req 4.3).
 * - A bar chart of total amount grouped by calendar month ("YYYY-MM"), one bar
 *   per month with at least one expense (Req 4.4).
 *
 * Behavior by status:
 *
 * - `loading` — show a loading indicator until retrieval completes or fails.
 * - `ready` with no expenses — show an empty-state message instead of empty
 *   charts (Req 4.6).
 * - `ready` with expenses — render the total and the three charts (Req 4.1–4.4).
 * - `error` — show an error message plus a retry control that re-attempts the
 *   read via `retry()`; previously displayed data is retained by the hook and
 *   left rendered unchanged (Req 4.7).
 *
 * The aggregation is delegated to the pure functions in
 * {@link ../domain/aggregation}. Charts are wrapped in Recharts'
 * `ResponsiveContainer` and themed to the dark glass aesthetic.
 */
import { useState } from 'react';

import { useExpenses } from '../state/useExpenses';
import { useIncome } from '../state/useIncome';
import { useCategories } from '../state/useCategories';
import { useSubCategories } from '../state/useSubCategories';
import { useSubSources } from '../state/useSubSources';
import { totalAmount } from '../domain/aggregation';
import { Money } from './Money';
import { Loader } from './Loader';
import { Insights } from './Insights';
import { SpendingChartCard } from './SpendingChartCard';
import { CategoryDetail } from './CategoryDetail';

/** Message shown when no expenses exist for the family group (Req 4.6). */
const EMPTY_STATE_MESSAGE = 'No expenses have been recorded yet.';

/** Message shown when the dashboard data could not be loaded (Req 4.7). */
const LOAD_ERROR_MESSAGE = 'Dashboard data could not be loaded.';

/**
 * Render the spending dashboard with total, category/source/month charts, and
 * loading, empty, and error states.
 *
 * @param familyId - The active family's id, forwarded to {@link useExpenses}.
 *   Defaults to `null` until the `FamilyProvider`/routing wiring lands
 *   (tasks 28.4/31), at which point the active family id is passed in.
 * @param active - Whether a Session is active; forwarded to {@link useExpenses}.
 *   Defaults to `true` (the hook's own default), matching the guarded route
 *   where this screen is only mounted within an active Session.
 *
 * Validates: Requirements 4.1, 4.2, 4.3, 4.4, 4.5, 4.6, 4.7
 */
export function Dashboard({
  familyId = null,
  active = true,
}: { familyId?: string | null; active?: boolean } = {}): JSX.Element {
  // SHIM (tasks 28.4/31): `familyId` defaults to `null` so the hook stays idle
  // until `useFamily` supplies the active family id.
  const { expenses, status, retry } = useExpenses(familyId, active);
  const { incomes } = useIncome(familyId, active);

  // Family-scoped categories, used to resolve each Expense's `categoryId` to a
  // human-readable Category name for the by-category chart (Req 7.2). The hook
  // shares the same family scope as `useExpenses`, so the labels stay in sync.
  const { categories } = useCategories(familyId);
  const { subCategories } = useSubCategories(familyId);
  const { subSources } = useSubSources(familyId);

  // Category drill-down opened from the spending chart, or null when closed.
  const [selectedCategory, setSelectedCategory] = useState<
    { id: string | null; name: string } | null
  >(null);

  // Map categoryId -> display name so the category chart shows real family
  // Category names rather than ids. Recomputes when the category list changes,
  // keeping labels live as categories are added/renamed (Req 7.5).
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));
  // Reverse lookup so a chart label can resolve back to its category id for the
  // drill-down (null for the "Uncategorized" bucket).
  const categoryIdByName = new Map(categories.map((category) => [category.name, category.id]));

  // Aggregations recompute on every render from the current expenses, so the
  // total and charts always reflect the latest snapshot delivered by the live
  // subscription (Req 7.5). The category grouping is keyed by `categoryId`
  // (resolved to a name for display) so each category is one bucket regardless
  // of legacy name strings or renames; expenses without a categoryId collapse
  // into a single "Uncategorized" bucket. Total/source/month are unchanged.
  const total = totalAmount(expenses);
  // Income totals (money in) and the resulting net balance (in − out). Income
  // uses the same cents-accurate summation as expenses.
  const totalIncomeAmount = totalAmount(incomes);
  const netBalance = Math.round((totalIncomeAmount - total) * 100) / 100;

  const hasExpenses = expenses.length > 0;
  // The summary tiles are meaningful when the family has any cash-flow data —
  // income, expenses, or both — so an income-only family still sees them.
  const hasData = hasExpenses || incomes.length > 0;

  return (
    <section
      data-screen="dashboard"
      aria-label="Spending dashboard"
      className="p-4 md:px-container_padding md:py-8 flex flex-col gap-4 md:gap-grid_gap"
    >
      <h1 className="text-2xl md:text-headline-lg font-bold text-on-surface">Dashboard</h1>

      {/* Loading indicator while the data is being retrieved. */}
      {status === 'loading' && (
        <Loader label="Loading dashboard…" block testId="dashboard-loading" />
      )}

      {/*
        Read-error message + retry control (Req 4.7). Previously displayed data
        is retained by the hook and still rendered below unchanged.
      */}
      {status === 'error' && (
        <div
          role="alert"
          className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4"
        >
          <p data-testid="dashboard-error" className="text-error">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={retry}
            data-testid="dashboard-retry"
            className="btn-ghost px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state once a successful read returns no income or expenses. */}
      {status === 'ready' && !hasData && (
        <div className="glass-card p-card_padding flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-primary-container text-4xl" aria-hidden="true">
            account_balance_wallet
          </span>
          <p data-testid="dashboard-empty" className="text-on-surface-variant text-body-lg">
            {EMPTY_STATE_MESSAGE}
          </p>
        </div>
      )}

      {/* Summary tiles + visualizations. The tiles render whenever there is any
          cash-flow data (income and/or expenses); the spending charts render
          only when there are expenses to chart. */}
      {hasData && (
        <div className="grid grid-cols-12 gap-4 md:gap-grid_gap">
          {/* Hero row: total spend, total income, and net balance. Compact and
              2-up on mobile, expanding to thirds on large screens. */}
          <div className="col-span-6 lg:col-span-4 glass-card glass-card-hover p-4 md:p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-1 md:mb-2">
              Total Spend
            </h2>
            <Money
              amount={total}
              testId="dashboard-total"
              className="text-[clamp(20px,5vw,48px)] leading-none font-extrabold tracking-tighter text-white neon-glow"
            />
            <span className="material-symbols-outlined absolute right-3 top-3 md:right-6 md:top-6 text-error/30 text-2xl md:text-4xl pointer-events-none" aria-hidden="true">
              arrow_upward
            </span>
          </div>
          <div className="col-span-6 lg:col-span-4 glass-card glass-card-hover p-4 md:p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-1 md:mb-2">
              Total Income
            </h2>
            <Money
              amount={totalIncomeAmount}
              testId="dashboard-income-total"
              className="text-[clamp(20px,5vw,48px)] leading-none font-extrabold tracking-tighter text-emerald-400 neon-glow"
            />
            <span className="material-symbols-outlined absolute right-3 top-3 md:right-6 md:top-6 text-emerald-400/30 text-2xl md:text-4xl pointer-events-none" aria-hidden="true">
              arrow_downward
            </span>
          </div>
          <div className="col-span-12 lg:col-span-4 glass-card glass-card-hover p-4 md:p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-1 md:mb-2">
              Net Balance
            </h2>
            <Money
              amount={netBalance}
              testId="dashboard-net-balance"
              className={`text-[clamp(20px,5vw,48px)] leading-none font-extrabold tracking-tighter neon-glow ${
                netBalance >= 0 ? 'text-emerald-400' : 'text-error'
              }`}
            />
            <p className="text-xs text-on-surface-variant mt-1 md:mt-2">
              {netBalance >= 0 ? 'Income exceeds spending' : 'Spending exceeds income'}
            </p>
            <span className="material-symbols-outlined absolute right-3 top-3 md:right-6 md:top-6 text-primary-container/30 text-2xl md:text-4xl pointer-events-none" aria-hidden="true">
              account_balance
            </span>
          </div>

          {hasExpenses && (
            <div className="col-span-12">
              <SpendingChartCard
                expenses={expenses}
                categoryNameById={categoryNameById}
                onOpenCategory={(label) =>
                  setSelectedCategory({ id: categoryIdByName.get(label) ?? null, name: label })
                }
              />
            </div>
          )}
        </div>
      )}

      {/* Deeper insights rendered inline below the overview (no toggle): the
          two screens were merged into a single continuous page. The Insights
          component renders its own heading and skips its own loading/empty
          chrome when there is nothing to show. */}
      {hasData && <Insights familyId={familyId} active={active} />}

      {/* Category drill-down opened from the spending chart's second tap. */}
      {selectedCategory !== null && (
        <CategoryDetail
          familyId={familyId}
          categoryId={selectedCategory.id}
          categoryName={selectedCategory.name}
          expenses={expenses}
          categories={categories}
          subCategories={subCategories}
          subSources={subSources}
          onClose={() => setSelectedCategory(null)}
        />
      )}
    </section>
  );
}
