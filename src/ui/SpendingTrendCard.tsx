/**
 * Spending trend line chart for the dashboard/insights.
 *
 * Replaces the old "this month vs last month" category list with a continuous
 * time-series line: spend per period (month or year, toggle) over the last
 * several periods. A scope selector tracks either ALL spending, a single
 * category, or a single sub-category within a category, so a member can watch
 * one line move month-on-month or year-on-year.
 *
 * Pure series math lives in {@link ../domain/insights.spendingSeries}; this
 * component only wires the controls, scope predicate, and Recharts rendering.
 */
import { useMemo, useState } from 'react';

import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { spendingSeries, type SeriesGranularity } from '../domain/insights';
import type { Expense, FamilyCategory, SubCategory } from '../domain/types';
import { formatINR } from './Money';

const ACCENT = '#00f5ff';

const TOOLTIP_CONTENT_STYLE: React.CSSProperties = {
  background: '#1f2021',
  border: '1px solid rgba(0, 245, 255, 0.3)',
  borderRadius: 12,
  color: '#e4e2e3',
};

const AXIS_TICK = { fill: '#b9caca', fontSize: 11 } as const;

/** How many periods to plot per granularity. */
const PERIODS: Record<SeriesGranularity, number> = { month: 12, year: 5 };

/** Props for {@link SpendingTrendCard}. */
export interface SpendingTrendCardProps {
  expenses: Expense[];
  categories: FamilyCategory[];
  subCategories: SubCategory[];
}

/** Render the spending-trend line chart with granularity + scope controls. */
export function SpendingTrendCard({
  expenses,
  categories,
  subCategories,
}: SpendingTrendCardProps): JSX.Element {
  const [granularity, setGranularity] = useState<SeriesGranularity>('month');
  // Scope: '' = all spending, a category id, or `sub:<id>` for a sub-category.
  const [scope, setScope] = useState<string>('');

  const today = new Date();

  // Sub-categories under the chosen category (when a plain category is scoped),
  // offered as an optional second-level select.
  const selectedCategoryId = scope.startsWith('sub:') ? null : scope || null;
  const subOptions = useMemo(
    () =>
      selectedCategoryId === null
        ? []
        : subCategories.filter((s) => s.categoryId === selectedCategoryId),
    [selectedCategoryId, subCategories],
  );

  // Build the scope predicate + a human label for the series.
  const { predicate, scopeLabel } = useMemo(() => {
    if (scope.startsWith('sub:')) {
      const subId = scope.slice(4);
      const sub = subCategories.find((s) => s.id === subId);
      return {
        predicate: (e: Expense) => e.subCategoryId === subId,
        scopeLabel: sub?.name ?? 'Sub-category',
      };
    }
    if (scope !== '') {
      const cat = categories.find((c) => c.id === scope);
      return {
        predicate: (e: Expense) => e.categoryId === scope,
        scopeLabel: cat?.name ?? 'Category',
      };
    }
    return { predicate: () => true, scopeLabel: 'All spending' };
  }, [scope, categories, subCategories]);

  const series = useMemo(
    () => spendingSeries(expenses, today, granularity, PERIODS[granularity], predicate),
    // today is recreated each render but only its period matters; depend on the
    // primitives that actually change the series.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [expenses, granularity, predicate],
  );

  return (
    <section
      className="glass-card glass-card-hover p-4 md:p-card_padding flex flex-col gap-3"
      data-testid="spending-trend-card"
      aria-label="Spending trend"
    >
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h2 className="text-base md:text-headline-md font-semibold text-on-surface">
          Spending trend
        </h2>
        {/* Month / Year granularity toggle. */}
        <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 shrink-0">
          <button
            type="button"
            onClick={() => setGranularity('month')}
            aria-pressed={granularity === 'month'}
            data-testid="trend-granularity-month"
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-wider font-bold transition-all ${
              granularity === 'month'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Monthly
          </button>
          <button
            type="button"
            onClick={() => setGranularity('year')}
            aria-pressed={granularity === 'year'}
            data-testid="trend-granularity-year"
            className={`px-3 py-1 rounded-full text-[11px] uppercase tracking-wider font-bold transition-all ${
              granularity === 'year'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Yearly
          </button>
        </div>
      </div>

      {/* Scope selectors: category, then optional sub-category. */}
      <div className="flex gap-2 flex-wrap">
        <select
          value={scope.startsWith('sub:') ? selectedCategoryFromSub(scope, subCategories) : scope}
          onChange={(e) => setScope(e.target.value)}
          aria-label="Category to track"
          data-testid="trend-scope-category"
          className="ghost-input px-3 py-2 text-sm flex-1 min-w-[8rem]"
        >
          <option value="">All spending</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>
        {subOptions.length > 0 && (
          <select
            value={scope.startsWith('sub:') ? scope : ''}
            onChange={(e) => setScope(e.target.value === '' ? (selectedCategoryId ?? '') : e.target.value)}
            aria-label="Sub-category to track"
            data-testid="trend-scope-subcategory"
            className="ghost-input px-3 py-2 text-sm flex-1 min-w-[8rem]"
          >
            <option value="">All sub-categories</option>
            {subOptions.map((s) => (
              <option key={s.id} value={`sub:${s.id}`}>{s.name}</option>
            ))}
          </select>
        )}
      </div>

      <p className="text-xs text-on-surface-variant -mt-1">{scopeLabel}</p>

      <div className="w-full h-[240px] md:h-[280px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={series} margin={{ top: 8, right: 12, bottom: 8, left: 4 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
            <XAxis
              dataKey="key"
              tick={AXIS_TICK}
              tickLine={false}
              stroke="#3a494a"
              interval="preserveStartEnd"
              minTickGap={16}
            />
            <YAxis tick={AXIS_TICK} tickLine={false} stroke="#3a494a" width={44} />
            <Tooltip
              contentStyle={TOOLTIP_CONTENT_STYLE}
              labelStyle={{ color: '#b9caca' }}
              formatter={(value) => [formatINR(typeof value === 'number' ? value : Number(value)), scopeLabel]}
            />
            <Line
              type="monotone"
              dataKey="total"
              stroke={ACCENT}
              strokeWidth={2.5}
              dot={{ r: 3, fill: ACCENT }}
              activeDot={{ r: 5 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </section>
  );
}

/** Resolve the parent category id for a `sub:<id>` scope, for the select value. */
function selectedCategoryFromSub(scope: string, subCategories: SubCategory[]): string {
  const subId = scope.slice(4);
  return subCategories.find((s) => s.id === subId)?.categoryId ?? '';
}
