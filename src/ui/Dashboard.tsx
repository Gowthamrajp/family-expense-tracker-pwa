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
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useExpenses } from '../state/useExpenses';
import { useIncome } from '../state/useIncome';
import { useCategories } from '../state/useCategories';
import {
  groupByMonth,
  groupByReference,
  groupBySource,
  totalAmount,
} from '../domain/aggregation';
import type { GroupTotal } from '../domain/types';
import { Money, formatINR } from './Money';
import { Loader } from './Loader';

/** Message shown when no expenses exist for the family group (Req 4.6). */
const EMPTY_STATE_MESSAGE = 'No expenses have been recorded yet.';

/** Message shown when the dashboard data could not be loaded (Req 4.7). */
const LOAD_ERROR_MESSAGE = 'Dashboard data could not be loaded.';

/** Format a monetary amount as INR currency (shared helper). */
function formatAmount(amount: number): string {
  return formatINR(amount);
}

/** Neon-cyan accent used across chart bars/gradients. */
const ACCENT = '#00f5ff';

/** Shared dark tooltip styling matching the glass theme. */
const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: '#1f2021',
  border: '1px solid rgba(0, 245, 255, 0.3)',
  borderRadius: 12,
  color: '#e4e2e3',
};

/** Axis tick text styling (on-surface-variant). */
const AXIS_TICK = { fill: '#b9caca', fontSize: 12 } as const;

/** Props for {@link ChartSection}. */
interface ChartSectionProps {
  title: string;
  testId: string;
  data: GroupTotal[];
  gradientId: string;
}

/**
 * Render a titled bar chart of group totals inside a responsive container.
 *
 * The chart plots one bar per {@link GroupTotal}, with the group key on the X
 * axis and its total on the Y axis, themed with a vertical cyan gradient,
 * muted grid lines, and a dark tooltip.
 */
function ChartSection({
  title,
  testId,
  data,
  gradientId,
}: ChartSectionProps): JSX.Element {
  return (
    <section
      className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      data-testid={testId}
      aria-label={title}
    >
      <h2 className="text-headline-md font-semibold text-on-surface">{title}</h2>
      <div className="w-full h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <defs>
              <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={ACCENT} stopOpacity={0.9} />
                <stop offset="100%" stopColor={ACCENT} stopOpacity={0.25} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis dataKey="key" tick={AXIS_TICK} tickLine={false} stroke="#3a494a" />
            <YAxis tick={AXIS_TICK} tickLine={false} stroke="#3a494a" />
            <Tooltip
              cursor={{ fill: 'rgba(0,245,255,0.06)' }}
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={{ color: '#b9caca' }}
              formatter={(value) =>
                formatAmount(typeof value === 'number' ? value : Number(value))
              }
            />
            <Bar dataKey="total" fill={`url(#${gradientId})`} name={title} radius={[6, 6, 0, 0]}>
              {data.map((entry) => (
                <Cell key={entry.key} fill={`url(#${gradientId})`} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

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

  // Map categoryId -> display name so the category chart shows real family
  // Category names rather than ids. Recomputes when the category list changes,
  // keeping labels live as categories are added/renamed (Req 7.5).
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

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
  const byCategory = groupByReference(
    expenses,
    (expense) => expense.categoryId,
    (id) => categoryNameById.get(id) ?? 'Unknown',
    'Uncategorized',
  );
  const bySource = groupBySource(expenses);
  const byMonth = groupByMonth(expenses);

  const hasExpenses = expenses.length > 0;
  // The summary tiles are meaningful when the family has any cash-flow data —
  // income, expenses, or both — so an income-only family still sees them.
  const hasData = hasExpenses || incomes.length > 0;

  return (
    <section
      data-screen="dashboard"
      aria-label="Spending dashboard"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap"
    >
      <h1 className="text-headline-lg font-bold text-on-surface">Dashboard</h1>

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
        <div className="grid grid-cols-12 gap-grid_gap">
          {/* Hero row: total spend, total income, and net balance. */}
          <div className="col-span-12 md:col-span-6 lg:col-span-4 glass-card glass-card-hover p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-2">
              Total Family Spend
            </h2>
            <Money
              amount={total}
              testId="dashboard-total"
              className="text-[clamp(32px,6vw,48px)] leading-none font-extrabold tracking-tighter text-white neon-glow"
            />
            <span className="material-symbols-outlined absolute right-6 top-6 text-error/30 text-4xl pointer-events-none" aria-hidden="true">
              south_west
            </span>
          </div>
          <div className="col-span-12 md:col-span-6 lg:col-span-4 glass-card glass-card-hover p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-2">
              Total Income
            </h2>
            <Money
              amount={totalIncomeAmount}
              testId="dashboard-income-total"
              className="text-[clamp(32px,6vw,48px)] leading-none font-extrabold tracking-tighter text-primary-container neon-glow"
            />
            <span className="material-symbols-outlined absolute right-6 top-6 text-primary-container/30 text-4xl pointer-events-none" aria-hidden="true">
              north_east
            </span>
          </div>
          <div className="col-span-12 lg:col-span-4 glass-card glass-card-hover p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-2">
              Net Balance
            </h2>
            <Money
              amount={netBalance}
              testId="dashboard-net-balance"
              className={`text-[clamp(32px,6vw,48px)] leading-none font-extrabold tracking-tighter neon-glow ${
                netBalance >= 0 ? 'text-primary-container' : 'text-error'
              }`}
            />
            <p className="text-xs text-on-surface-variant mt-2">
              {netBalance >= 0 ? 'Income exceeds spending' : 'Spending exceeds income'}
            </p>
            <span className="material-symbols-outlined absolute right-6 top-6 text-primary-container/30 text-4xl pointer-events-none" aria-hidden="true">
              account_balance
            </span>
          </div>

          {hasExpenses && (
            <>
              <div className="col-span-12 lg:col-span-7">
                <ChartSection
                  title="Spending by category"
                  testId="dashboard-category-chart"
                  data={byCategory}
                  gradientId="grad-category"
                />
              </div>
              <div className="col-span-12 lg:col-span-5">
                <ChartSection
                  title="Spending by source"
                  testId="dashboard-source-chart"
                  data={bySource}
                  gradientId="grad-source"
                />
              </div>
              <div className="col-span-12">
                <ChartSection
                  title="Spending by month"
                  testId="dashboard-month-chart"
                  data={byMonth}
                  gradientId="grad-month"
                />
              </div>
            </>
          )}
        </div>
      )}
    </section>
  );
}
