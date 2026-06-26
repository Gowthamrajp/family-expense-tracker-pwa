/**
 * A single, self-mutating spending chart card for the dashboard.
 *
 * One card with three controls:
 * - a DIMENSION selector — Category / Source / Month;
 * - a chart-TYPE toggle — Bar / Pie (categorical dimensions only);
 * - a MONTH selector for the categorical dimensions (Category/Source), so the
 *   breakdown is scoped to a chosen calendar month (defaults to the current
 *   month). The Month dimension is the cross-month overview and ignores it.
 *
 * The card receives the raw expenses plus a category-id→name resolver and does
 * its own month filtering + aggregation, so scoping by month stays correct
 * regardless of how the parent pre-aggregates.
 *
 * Interaction (Category dimension only): tapping a bar/slice/legend row first
 * SELECTS it; tapping the already-selected entry again OPENS its drill-down via
 * {@link onOpenCategory}.
 */
import { useMemo, useState } from 'react';

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import {
  groupByMonth,
  groupByReference,
  groupBySource,
} from '../domain/aggregation';
import { currentMonthKey, monthKey } from '../domain/insights';
import type { Expense } from '../domain/types';
import { formatINR } from './Money';

/** Which grouping the card is currently showing. */
type Dimension = 'category' | 'source' | 'month';
/** Which visualization the card is currently showing. */
type ChartType = 'bar' | 'pie';

const ACCENT = '#00f5ff';

/** Palette for pie slices (cyan family, matching the theme). */
const SLICE_COLORS = [
  '#00f5ff',
  '#63f7ff',
  '#00b8c4',
  '#7de3ea',
  '#3a99a0',
  '#b9caca',
  '#849495',
  '#00dce5',
  '#006c71',
];

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: '#1f2021',
  border: '1px solid rgba(0, 245, 255, 0.3)',
  borderRadius: 12,
  color: '#e4e2e3',
};

const AXIS_TICK = { fill: '#b9caca', fontSize: 12 } as const;

/** Props for {@link SpendingChartCard}. */
export interface SpendingChartCardProps {
  /** All family expenses; the card filters/aggregates internally. */
  expenses: Expense[];
  /** Resolve a categoryId to its display name (for the category breakdown). */
  categoryNameById: Map<string, string>;
  /**
   * Open the drill-down for a category label. Wired only for the Category
   * dimension; invoked on the SECOND tap of an already-selected entry.
   */
  onOpenCategory?: (label: string) => void;
}

const DIMENSIONS: ReadonlyArray<{ key: Dimension; label: string }> = [
  { key: 'category', label: 'Category' },
  { key: 'source', label: 'Source' },
  { key: 'month', label: 'Month' },
];

/** Human label for a "YYYY-MM" key, e.g. "Jun 2026". */
const MONTH_LABEL_FMT = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  year: 'numeric',
});
function monthLabel(key: string): string {
  const [y, m] = key.split('-').map((s) => parseInt(s, 10));
  if (!y || !m) return key;
  return MONTH_LABEL_FMT.format(new Date(y, m - 1, 1));
}

/** Render the consolidated, mutating spending chart. */
export function SpendingChartCard({
  expenses,
  categoryNameById,
  onOpenCategory,
}: SpendingChartCardProps): JSX.Element {
  const [dimension, setDimension] = useState<Dimension>('category');
  const [chartType, setChartType] = useState<ChartType>('bar');
  // The currently-selected entry key (for the two-tap select-then-open flow).
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  // The month the categorical breakdowns are scoped to (defaults to current).
  const [month, setMonth] = useState<string>(() => currentMonthKey(new Date()));

  // Pie only makes sense for part-of-whole (categorical) dimensions; Month is a
  // time series, so it forces bars.
  const pieAllowed = dimension !== 'month';
  const effectiveType: ChartType = pieAllowed ? chartType : 'bar';
  // Drill-down only applies to the category dimension.
  const drillable = dimension === 'category' && onOpenCategory !== undefined;
  // Category/Source are month-scoped; Month is the cross-month overview.
  const monthScoped = dimension !== 'month';

  // Months that have any spending, plus the current month, newest-first — used
  // to populate the month selector.
  const monthOptions = useMemo(() => {
    const set = new Set<string>(expenses.map((e) => monthKey(e.date)));
    set.add(currentMonthKey(new Date()));
    return [...set].sort((a, b) => b.localeCompare(a));
  }, [expenses]);

  // Expenses scoped to the selected month for the categorical breakdowns.
  const monthExpenses = useMemo(
    () => expenses.filter((e) => monthKey(e.date) === month),
    [expenses, month],
  );

  const data = useMemo(() => {
    switch (dimension) {
      case 'source':
        return groupBySource(monthExpenses).sort((a, b) => b.total - a.total);
      case 'month':
        // Cross-month overview from ALL expenses, chronological order.
        return groupByMonth(expenses).sort((a, b) => a.key.localeCompare(b.key));
      case 'category':
      default:
        return groupByReference(
          monthExpenses,
          (e) => e.categoryId,
          (id) => categoryNameById.get(id) ?? 'Unknown',
          'Uncategorized',
        ).sort((a, b) => b.total - a.total);
    }
  }, [dimension, monthExpenses, expenses, categoryNameById]);

  const total = useMemo(() => data.reduce((sum, d) => sum + d.total, 0), [data]);

  const changeDimension = (key: Dimension): void => {
    setDimension(key);
    setSelectedKey(null);
  };

  // First tap selects; tapping the already-selected entry opens its drill-down
  // (category dimension only). Non-drillable dimensions just toggle selection.
  const handleEntryActivate = (key: string): void => {
    if (drillable && selectedKey === key) {
      onOpenCategory?.(key);
      return;
    }
    setSelectedKey((prev) => (prev === key ? null : key));
  };

  return (
    <section
      className="glass-card glass-card-hover p-4 md:p-card_padding flex flex-col gap-3"
      data-testid="dashboard-spending-chart"
      aria-label="Spending breakdown"
    >
      {/* Header: title + chart-type toggle. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base md:text-headline-md font-semibold text-on-surface">
          Spending by {dimension}
          {monthScoped && (
            <span className="text-on-surface-variant font-normal"> · {monthLabel(month)}</span>
          )}
        </h2>
        {pieAllowed && (
          <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 shrink-0">
            <button
              type="button"
              onClick={() => setChartType('bar')}
              aria-pressed={effectiveType === 'bar'}
              aria-label="Bar chart"
              data-testid="chart-type-bar"
              className={`p-1.5 rounded-full transition-all ${
                effectiveType === 'bar'
                  ? 'bg-primary-container text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">bar_chart</span>
            </button>
            <button
              type="button"
              onClick={() => setChartType('pie')}
              aria-pressed={effectiveType === 'pie'}
              aria-label="Pie chart"
              data-testid="chart-type-pie"
              className={`p-1.5 rounded-full transition-all ${
                effectiveType === 'pie'
                  ? 'bg-primary-container text-on-primary'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">pie_chart</span>
            </button>
          </div>
        )}
      </div>

      {/* Dimension pills + (for categorical dimensions) a month selector. */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div role="tablist" aria-label="Group spending by" className="flex gap-1.5 flex-wrap">
          {DIMENSIONS.map(({ key, label }) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={dimension === key}
              onClick={() => changeDimension(key)}
              data-testid={`chart-dim-${key}`}
              className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
                dimension === key
                  ? 'bg-primary-container text-on-primary'
                  : 'bg-surface-container-low text-on-surface-variant border border-outline-variant/20 hover:text-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
        {monthScoped && (
          <select
            value={month}
            onChange={(e) => {
              setMonth(e.target.value);
              setSelectedKey(null);
            }}
            aria-label="Month"
            data-testid="chart-month"
            className="ghost-input px-2.5 py-1 text-xs shrink-0"
          >
            {monthOptions.map((key) => (
              <option key={key} value={key}>{monthLabel(key)}</option>
            ))}
          </select>
        )}
      </div>

      {/* Empty-for-month state (categorical dimensions with no spend that month). */}
      {monthScoped && data.length === 0 ? (
        <div className="w-full h-[200px] flex flex-col items-center justify-center gap-2 text-center">
          <span className="material-symbols-outlined text-on-surface-variant/50 text-3xl" aria-hidden="true">
            event_busy
          </span>
          <p className="text-sm text-on-surface-variant">
            No spending in {monthLabel(month)}.
          </p>
        </div>
      ) : (
      <>
      {/* Chart. Pie is shorter (its legend carries the detail) to avoid the
          large empty margins a tall pie leaves; bars need extra height for the
          angled category labels. */}
      <div className={effectiveType === 'pie' ? 'w-full h-[200px]' : 'w-full h-[260px] md:h-[300px]'}>
        <ResponsiveContainer width="100%" height="100%">
          {effectiveType === 'pie' ? (
            <PieChart margin={{ top: 0, right: 0, bottom: 0, left: 0 }}>
              <Pie
                data={data}
                dataKey="total"
                nameKey="key"
                innerRadius="52%"
                outerRadius="92%"
                paddingAngle={2}
                stroke="none"
                onClick={(entry) => {
                  const key = (entry as { key?: string }).key;
                  if (typeof key === 'string') handleEntryActivate(key);
                }}
              >
                {data.map((entry, index) => (
                  <Cell
                    key={entry.key}
                    fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                    opacity={selectedKey === null || selectedKey === entry.key ? 1 : 0.35}
                    stroke={selectedKey === entry.key ? '#e4e2e3' : 'none'}
                    strokeWidth={selectedKey === entry.key ? 2 : 0}
                    style={{ cursor: drillable ? 'pointer' : 'default' }}
                  />
                ))}
              </Pie>
              <Tooltip
                contentStyle={TOOLTIP_CONTENT_STYLE}
                formatter={(value, name) => {
                  const v = typeof value === 'number' ? value : Number(value);
                  const pct = total > 0 ? ` (${((v / total) * 100).toFixed(0)}%)` : '';
                  return [`${formatINR(v)}${pct}`, name as string];
                }}
              />
            </PieChart>
          ) : (
            <BarChart data={data} margin={{ top: 8, right: 8, bottom: 56, left: 4 }}>
              <defs>
                <linearGradient id="grad-spending" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor={ACCENT} stopOpacity={0.9} />
                  <stop offset="100%" stopColor={ACCENT} stopOpacity={0.25} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
              <XAxis
                dataKey="key"
                tick={AXIS_TICK}
                tickLine={false}
                stroke="#3a494a"
                interval={0}
                angle={-40}
                textAnchor="end"
                height={56}
                tickMargin={8}
              />
              <YAxis tick={AXIS_TICK} tickLine={false} stroke="#3a494a" width={44} />
              <Tooltip
                cursor={{ fill: 'rgba(0,245,255,0.06)' }}
                contentStyle={TOOLTIP_CONTENT_STYLE}
                labelStyle={{ color: '#b9caca' }}
                formatter={(value) =>
                  formatINR(typeof value === 'number' ? value : Number(value))
                }
              />
              <Bar
                dataKey="total"
                radius={[6, 6, 0, 0]}
                onClick={(entry) => {
                  const key = (entry as { key?: string }).key;
                  if (typeof key === 'string') handleEntryActivate(key);
                }}
              >
                {data.map((entry) => (
                  <Cell
                    key={entry.key}
                    fill="url(#grad-spending)"
                    opacity={selectedKey === null || selectedKey === entry.key ? 1 : 0.4}
                    stroke={selectedKey === entry.key ? '#e4e2e3' : 'none'}
                    strokeWidth={selectedKey === entry.key ? 1.5 : 0}
                    style={{ cursor: drillable ? 'pointer' : 'default' }}
                  />
                ))}
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>

      {/* Pie legend with share percentages (categorical only). Rows are
          clickable, mirroring the chart's select-then-open behavior. */}
      {effectiveType === 'pie' && (
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5">
          {data.map((entry, index) => {
            const dimmed = selectedKey !== null && selectedKey !== entry.key;
            return (
              <li key={entry.key}>
                <button
                  type="button"
                  onClick={() => handleEntryActivate(entry.key)}
                  className={`flex items-center gap-1.5 text-xs min-w-0 rounded-md px-1 py-0.5 transition-opacity ${
                    drillable ? 'cursor-pointer hover:bg-surface-container-highest/60' : ''
                  } ${dimmed ? 'opacity-40' : ''}`}
                >
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                  />
                  <span className="text-on-surface-variant truncate">{entry.key}</span>
                  <span className="font-mono-data text-on-surface">
                    {total > 0 ? `${((entry.total / total) * 100).toFixed(0)}%` : '0%'}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* Hint for the two-tap drill-down on the category dimension. */}
      {drillable && (
        <p className="text-[11px] text-on-surface-variant/70">
          {selectedKey !== null
            ? `Tap "${selectedKey}" again to open its details.`
            : 'Tap a category to highlight it; tap again to open details.'}
        </p>
      )}
      </>
      )}
    </section>
  );
}
