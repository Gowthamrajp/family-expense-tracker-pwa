/**
 * Financial Insights screen.
 *
 * Presents month-over-month spending analytics for the family, derived live
 * from the expense list via {@link useExpenses} and the pure helpers in
 * {@link ../domain/insights}:
 *
 * - a hero total for the current calendar month with its percent change vs the
 *   previous month;
 * - a category-distribution donut with a percentage legend;
 * - a this-month-vs-last-month per-category comparison with deltas.
 *
 * Category ids are resolved to family Category names via {@link useCategories}.
 * Amounts honor privacy mode through {@link Money}. Loading/empty/error states
 * mirror the dashboard.
 */
import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import {
  categoryComparison,
  categoryShares,
  computeDelta,
  currentMonthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import type { Expense } from '../domain/types';
import { useCategories } from '../state/useCategories';
import { useExpenses } from '../state/useExpenses';
import { Money, formatINR } from './Money';

/** Neon-cyan accent and a small palette for the donut slices. */
const SLICE_COLORS = [
  '#00f5ff',
  '#63f7ff',
  '#00b8c4',
  '#7de3ea',
  '#3a99a0',
  '#b9caca',
  '#849495',
];

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: '#1f2021',
  border: '1px solid rgba(0, 245, 255, 0.3)',
  borderRadius: 12,
  color: '#e4e2e3',
};

/** Render a signed percent badge (green up / red down / muted when no baseline). */
function DeltaBadge({ percent }: { percent: number | null }): JSX.Element {
  if (percent === null) {
    return <span className="text-xs text-on-surface-variant">new</span>;
  }
  const up = percent > 0;
  const flat = Math.abs(percent) < 0.05;
  const color = flat
    ? 'text-on-surface-variant'
    : up
      ? 'text-error'
      : 'text-primary-container';
  const icon = flat ? 'trending_flat' : up ? 'trending_up' : 'trending_down';
  return (
    <span className={`inline-flex items-center gap-1 text-xs font-medium ${color}`}>
      <span className="material-symbols-outlined text-sm" aria-hidden="true">
        {icon}
      </span>
      {up ? '+' : ''}
      {percent.toFixed(1)}%
    </span>
  );
}

/** Props for {@link Insights}. */
export interface InsightsProps {
  familyId?: string | null;
  active?: boolean;
}

/**
 * Render the Financial Insights screen.
 */
export function Insights({
  familyId = null,
  active = true,
}: InsightsProps = {}): JSX.Element {
  const { expenses, status, retry } = useExpenses(familyId, active);
  const { categories } = useCategories(familyId);

  const today = new Date();
  const categoryNameById = new Map(categories.map((c) => [c.id, c.name]));
  const labelOf = (expense: Expense): string => {
    const resolved =
      expense.categoryId !== undefined
        ? categoryNameById.get(expense.categoryId)
        : undefined;
    return resolved ?? expense.category;
  };

  const curKey = currentMonthKey(today);
  const prevKey = previousMonthKey(today);
  const currentTotal = totalForMonth(expenses, curKey);
  const previousTotal = totalForMonth(expenses, prevKey);
  const delta = computeDelta(currentTotal, previousTotal);

  const shares = categoryShares(expenses, labelOf);
  const comparison = categoryComparison(expenses, today, labelOf);

  const hasExpenses = expenses.length > 0;

  const donutData = shares.map((s) => ({ name: s.key, value: s.total }));

  return (
    <section
      data-screen="insights"
      aria-label="Financial insights"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap"
    >
      <div>
        <p className="text-label-caps uppercase tracking-widest text-primary-container mb-1">
          Analytics &amp; Insights
        </p>
        <h1 className="text-headline-lg font-bold text-on-surface">Spending insights</h1>
      </div>

      {status === 'loading' && (
        <p role="status" aria-live="polite" className="text-on-surface-variant">
          Loading insights…
        </p>
      )}

      {status === 'error' && (
        <div role="alert" className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4">
          <p className="text-error">Insights could not be loaded.</p>
          <button type="button" onClick={retry} className="btn-ghost px-4 py-2 text-sm">
            Retry
          </button>
        </div>
      )}

      {status === 'ready' && !hasExpenses && (
        <div className="glass-card p-card_padding flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-primary-container text-4xl" aria-hidden="true">
            leaderboard
          </span>
          <p className="text-on-surface-variant text-body-lg">
            No expenses yet — insights will appear once you record some spending.
          </p>
        </div>
      )}

      {hasExpenses && (
        <div className="grid grid-cols-12 gap-grid_gap">
          {/* Hero: this month's total + MoM delta. */}
          <div className="col-span-12 lg:col-span-7 glass-card glass-card-hover p-card_padding relative overflow-hidden">
            <h2 className="text-label-caps uppercase text-on-surface-variant mb-2">
              This month ({curKey})
            </h2>
            <Money
              amount={currentTotal}
              testId="insights-current-total"
              className="block text-[clamp(36px,7vw,56px)] leading-none font-extrabold tracking-tighter text-white neon-glow"
            />
            <div className="mt-3 flex items-center gap-2">
              <DeltaBadge percent={delta.percent} />
              <span className="text-sm text-on-surface-variant">
                vs last month ({formatINR(previousTotal)})
              </span>
            </div>
            <span className="material-symbols-outlined absolute right-6 top-6 text-primary-container/30 text-5xl" aria-hidden="true">
              trending_up
            </span>
          </div>

          {/* Category distribution donut. */}
          <div className="col-span-12 lg:col-span-5 glass-card glass-card-hover p-card_padding">
            <h2 className="text-headline-md font-semibold text-on-surface mb-4">
              Category distribution
            </h2>
            <div className="flex items-center gap-4 flex-wrap">
              <div className="w-40 h-40 shrink-0">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={donutData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={48}
                      outerRadius={72}
                      paddingAngle={2}
                      stroke="none"
                    >
                      {donutData.map((entry, index) => (
                        <Cell key={entry.name} fill={SLICE_COLORS[index % SLICE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={TOOLTIP_CONTENT_STYLE}
                      formatter={(value) =>
                        formatINR(typeof value === 'number' ? value : Number(value))
                      }
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <ul className="flex-1 min-w-[10rem] space-y-2">
                {shares.slice(0, 6).map((share, index) => (
                  <li key={share.key} className="flex items-center justify-between gap-2 text-sm">
                    <span className="flex items-center gap-2 min-w-0">
                      <span
                        className="w-2.5 h-2.5 rounded-full shrink-0"
                        style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                      />
                      <span className="text-on-surface-variant truncate">{share.key}</span>
                    </span>
                    <span className="font-mono-data text-on-surface">
                      {(share.fraction * 100).toFixed(0)}%
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* This month vs last month per category. */}
          <div className="col-span-12 glass-card glass-card-hover p-card_padding">
            <h2 className="text-headline-md font-semibold text-on-surface mb-6">
              This month vs last month
            </h2>
            {comparison.length === 0 ? (
              <p className="text-on-surface-variant">No category activity in these months.</p>
            ) : (
              <ul className="flex flex-col gap-5">
                {comparison.map((row) => {
                  const max = Math.max(row.current, row.previous, 1);
                  const curPct = (row.current / max) * 100;
                  const prevPct = (row.previous / max) * 100;
                  return (
                    <li key={row.key} className="flex flex-col gap-2">
                      <div className="flex items-center justify-between gap-3">
                        <span className="text-on-surface text-sm">{row.key}</span>
                        <div className="flex items-center gap-3">
                          <Money amount={row.current} className="font-mono-data text-sm text-on-surface" />
                          <DeltaBadge percent={row.percent} />
                        </div>
                      </div>
                      <div className="relative h-3 w-full rounded-full bg-surface-container-highest overflow-hidden">
                        {/* Previous-month marker (outline) under the current bar. */}
                        <div
                          className="absolute top-0 left-0 h-full border-r-2 border-primary-container/30"
                          style={{ width: `${prevPct}%` }}
                          aria-hidden="true"
                        />
                        <div
                          className="h-full bg-primary-container neon-border rounded-full"
                          style={{ width: `${curPct}%` }}
                        />
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="mt-6 flex items-center gap-4 text-xs text-on-surface-variant">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full bg-primary-container" /> Current
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-full border border-primary-container/40" /> Previous
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
