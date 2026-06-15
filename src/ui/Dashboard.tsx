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
 * {@link ../domain/aggregation}. Styling is intentionally minimal/inline for
 * the MVP and charts are wrapped in Recharts' `ResponsiveContainer`.
 */
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { useExpenses } from '../state/useExpenses';
import { useCategories } from '../state/useCategories';
import {
  groupByCategory,
  groupByMonth,
  groupBySource,
  totalAmount,
} from '../domain/aggregation';
import type { Expense, GroupTotal } from '../domain/types';

/** Message shown when no expenses exist for the family group (Req 4.6). */
const EMPTY_STATE_MESSAGE = 'No expenses have been recorded yet.';

/** Message shown when the dashboard data could not be loaded (Req 4.7). */
const LOAD_ERROR_MESSAGE = 'Dashboard data could not be loaded.';

/**
 * Format a monetary amount as currency for display.
 *
 * Uses INR as the MVP's single currency (multi-currency is out of scope),
 * matching the expense list's formatting. The `en-IN` locale renders the
 * rupee symbol with Indian digit grouping (e.g. ₹1,00,000.00).
 */
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

function formatAmount(amount: number): string {
  return currencyFormatter.format(amount);
}

const containerStyle: React.CSSProperties = {
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1.5rem',
};

const totalStyle: React.CSSProperties = {
  fontSize: '2rem',
  fontWeight: 600,
  margin: 0,
};

const chartSectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const errorStyle: React.CSSProperties = {
  color: '#b00020',
};

/** Fill color used for chart bars. */
const BAR_FILL = '#3367d6';

/** Props for {@link ChartSection}. */
interface ChartSectionProps {
  title: string;
  testId: string;
  data: GroupTotal[];
}

/**
 * Render a titled bar chart of group totals inside a responsive container.
 *
 * The chart plots one bar per {@link GroupTotal}, with the group key on the X
 * axis and its total on the Y axis.
 */
function ChartSection({ title, testId, data }: ChartSectionProps): JSX.Element {
  return (
    <section style={chartSectionStyle} data-testid={testId} aria-label={title}>
      <h2>{title}</h2>
      <div style={{ width: '100%', height: 280 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis dataKey="key" />
            <YAxis />
            <Tooltip
              formatter={(value) =>
                formatAmount(typeof value === 'number' ? value : Number(value))
              }
            />
            <Bar dataKey="total" fill={BAR_FILL} name={title} />
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

  // Family-scoped categories, used to resolve each Expense's `categoryId` to a
  // human-readable Category name for the by-category chart (Req 7.2). The hook
  // shares the same family scope as `useExpenses`, so the labels stay in sync.
  const { categories } = useCategories(familyId);

  // Map categoryId -> display name so the category chart shows real family
  // Category names rather than ids. Recomputes when the category list changes,
  // keeping labels live as categories are added/renamed (Req 7.5).
  const categoryNameById = new Map(categories.map((category) => [category.id, category.name]));

  // Derive a category-resolved view of the expenses for the by-category
  // grouping only: replace `category` with the resolved Category name when the
  // expense's `categoryId` maps to a known family Category, otherwise keep the
  // existing legacy `category` string. Source/month/total inputs are unchanged.
  const categoryResolvedExpenses: Expense[] = expenses.map((expense) => {
    const resolvedName =
      expense.categoryId !== undefined
        ? categoryNameById.get(expense.categoryId)
        : undefined;
    return resolvedName === undefined
      ? expense
      : { ...expense, category: resolvedName as Expense['category'] };
  });

  // Aggregations recompute on every render from the current expenses, so the
  // total and charts always reflect the latest snapshot delivered by the live
  // subscription (Req 7.5). Only the category grouping uses the resolved names;
  // total, source, and month grouping are computed from the raw expenses so
  // their aggregation is unchanged (Req 7.1, 7.3, 7.4).
  const total = totalAmount(expenses);
  const byCategory = groupByCategory(categoryResolvedExpenses);
  const bySource = groupBySource(expenses);
  const byMonth = groupByMonth(expenses);

  const hasExpenses = expenses.length > 0;

  return (
    <section data-screen="dashboard" aria-label="Spending dashboard" style={containerStyle}>
      <h1>Dashboard</h1>

      {/* Loading indicator while the data is being retrieved. */}
      {status === 'loading' && (
        <p role="status" aria-live="polite" data-testid="dashboard-loading">
          Loading dashboard…
        </p>
      )}

      {/*
        Read-error message + retry control (Req 4.7). Previously displayed data
        is retained by the hook and still rendered below unchanged.
      */}
      {status === 'error' && (
        <div role="alert" style={errorStyle}>
          <p data-testid="dashboard-error">{LOAD_ERROR_MESSAGE}</p>
          <button type="button" onClick={retry} data-testid="dashboard-retry">
            Retry
          </button>
        </div>
      )}

      {/* Empty state once a successful read returns no expenses (Req 4.6). */}
      {status === 'ready' && !hasExpenses && (
        <p data-testid="dashboard-empty">{EMPTY_STATE_MESSAGE}</p>
      )}

      {/* Total + visualizations (Req 4.1–4.4). Rendered whenever data exists,
          including the error case where prior data is retained (Req 4.7). */}
      {hasExpenses && (
        <>
          <div>
            <h2>Total spending</h2>
            <p style={totalStyle} data-testid="dashboard-total">
              {formatAmount(total)}
            </p>
          </div>

          <ChartSection
            title="Spending by category"
            testId="dashboard-category-chart"
            data={byCategory}
          />
          <ChartSection
            title="Spending by source"
            testId="dashboard-source-chart"
            data={bySource}
          />
          <ChartSection
            title="Spending by month"
            testId="dashboard-month-chart"
            data={byMonth}
          />
        </>
      )}
    </section>
  );
}
