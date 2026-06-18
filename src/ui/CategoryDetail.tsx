/**
 * Category / sub-category drill-down overlay.
 *
 * Opened from the Insights screen when a member taps a category. It scopes all
 * analytics to a single category so the sub-category split is actually useful
 * (vs. clubbing every category's sub-categories together):
 *
 * - a hero with the category's all-time total plus this-month total and a
 *   month-over-month delta;
 * - a sub-category split donut + clickable legend (this is the meaningful place
 *   for sub-category insight — within one category);
 * - the list of transactions filed under the category.
 *
 * Tapping a sub-category in the split drills one level deeper: the same overlay
 * re-scopes to that sub-category (hero total/delta + its transactions), with a
 * breadcrumb back to the category. Amounts honor privacy mode via {@link Money}.
 *
 * The overlay is a right-hand slide-over mirroring the transaction details
 * drawer: it locks background scroll while open and is dismissible via the
 * backdrop, a close control, or Escape.
 */
import { useEffect, useMemo, useState } from 'react';

import {
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';

import {
  computeBudgetStatus,
  effectiveLimit,
} from '../domain/budget';
import {
  computeDelta,
  currentMonthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import { totalAmount } from '../domain/aggregation';
import { resolveLabels } from '../domain/expenseMapper';
import { useAuth } from '../state/AuthProvider';
import { useScopedBudgets } from '../state/useScopedBudgets';
import type {
  Expense,
  FamilyCategory,
  SubCategory,
  SubSource,
} from '../domain/types';
import { Money, formatINR } from './Money';

/** Donut palette (matches the Insights screen). */
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

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/** Category-name → Material Symbols icon (kept in sync with ExpenseList). */
const CATEGORY_ICONS: ReadonlyArray<[RegExp, string]> = [
  [/grocer|food|supermarket/i, 'shopping_basket'],
  [/dining|restaurant|eat/i, 'restaurant'],
  [/transport|fuel|gas|car|travel/i, 'directions_car'],
  [/rent|hous|mortgage|utilit/i, 'home'],
  [/health|medical|pharm/i, 'medical_services'],
  [/leisure|entertain|movie|fun/i, 'movie'],
  [/shop|cloth|retail/i, 'shopping_bag'],
  [/bill|subscription|electric|water/i, 'receipt'],
  [/educat|school|tuition/i, 'school'],
  [/wellness|fitness|gym/i, 'fitness_center'],
];

function categoryIcon(categoryName: string): string {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(categoryName)) {
      return icon;
    }
  }
  return 'category';
}

/** A sub-category slice within a single category, retaining its id for drill-in. */
interface SubSlice {
  /** SubCategory id, or null for expenses with no sub-category in this category. */
  id: string | null;
  name: string;
  total: number;
  /** Share of the category total in [0, 1]. */
  fraction: number;
}

/** Identifies the active drill-down scope. */
interface SubScope {
  /** SubCategory id, or null for the "no sub-category" bucket. */
  id: string | null;
  name: string;
}

/** Props for {@link CategoryDetail}. */
export interface CategoryDetailProps {
  /** Active family id (for resolving scoped budgets), or null. */
  familyId?: string | null;
  /** Category id to scope to, or null for the "Uncategorized" bucket. */
  categoryId: string | null;
  /** Display name of the scoped category. */
  categoryName: string;
  /** All family expenses (filtered internally to the category). */
  expenses: Expense[];
  categories: FamilyCategory[];
  subCategories: SubCategory[];
  subSources: SubSource[];
  onClose: () => void;
}

/** Group a category's expenses into sub-category slices (cents-accurate). */
function subCategorySlices(
  inCategory: Expense[],
  subCategoryNameById: Map<string, string>,
): SubSlice[] {
  const centsById = new Map<string, number>();
  let grandCents = 0;
  for (const expense of inCategory) {
    const key = expense.subCategoryId ?? '__none__';
    const cents = Math.round(expense.amount * 100);
    centsById.set(key, (centsById.get(key) ?? 0) + cents);
    grandCents += cents;
  }
  const slices: SubSlice[] = [];
  for (const [key, cents] of centsById) {
    const id = key === '__none__' ? null : key;
    const name =
      id === null ? 'No sub-category' : subCategoryNameById.get(id) ?? 'Unknown';
    slices.push({
      id,
      name,
      total: cents / 100,
      fraction: grandCents === 0 ? 0 : cents / grandCents,
    });
  }
  slices.sort((a, b) => b.total - a.total);
  return slices;
}

/**
 * Slide-over overlay presenting drill-down insights for a single category and,
 * one level deeper, a single sub-category.
 */
export function CategoryDetail({
  familyId = null,
  categoryId,
  categoryName,
  expenses,
  categories,
  subCategories,
  subSources,
  onClose,
}: CategoryDetailProps): JSX.Element {
  const [subScope, setSubScope] = useState<SubScope | null>(null);

  // Lock background scroll while open; restore on close/unmount.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  // Close on Escape (drops one drill level first, then dismisses).
  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') {
        return;
      }
      setSubScope((current) => {
        if (current !== null) {
          return null;
        }
        onClose();
        return null;
      });
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const subCategoryNameById = useMemo(
    () => new Map(subCategories.map((s) => [s.id, s.name])),
    [subCategories],
  );

  const today = new Date();
  const curKey = currentMonthKey(today);
  const prevKey = previousMonthKey(today);

  // Expenses filed under this category (by id; null scope = no categoryId).
  const inCategory = useMemo(
    () =>
      expenses.filter((e) =>
        categoryId === null
          ? e.categoryId === undefined
          : e.categoryId === categoryId,
      ),
    [expenses, categoryId],
  );

  const slices = useMemo(
    () => subCategorySlices(inCategory, subCategoryNameById),
    [inCategory, subCategoryNameById],
  );

  // Active scope: the whole category, or one sub-category within it.
  const scoped = useMemo(() => {
    if (subScope === null) {
      return inCategory;
    }
    return inCategory.filter((e) =>
      subScope.id === null
        ? e.subCategoryId === undefined
        : e.subCategoryId === subScope.id,
    );
  }, [inCategory, subScope]);

  const scopeTotal = totalAmount(scoped);
  const currentTotal = totalForMonth(scoped, curKey);
  const previousTotal = totalForMonth(scoped, prevKey);
  const delta = computeDelta(currentTotal, previousTotal);

  // Resolve the budget for the active scope (the category, or a sub-category
  // when drilled in) and compute this-month progress against it.
  const { member } = useAuth();
  const { forCategory: budgetForCategory, forSubCategory: budgetForSubCategory } =
    useScopedBudgets(familyId, member);
  const scopeBudget =
    subScope === null
      ? categoryId !== null
        ? budgetForCategory(categoryId)
        : null
      : subScope.id !== null
        ? budgetForSubCategory(subScope.id)
        : null;
  const budgetLimit =
    scopeBudget === null
      ? null
      : effectiveLimit(
          scopeBudget.mode,
          scopeBudget.amount,
          scopeBudget.percent,
          previousTotal,
        );
  const budgetStatus = computeBudgetStatus(currentTotal, budgetLimit);
  const hasBudget = budgetLimit !== null && budgetLimit > 0;
  const budgetBarColor =
    budgetStatus.state === 'over'
      ? 'bg-error'
      : budgetStatus.state === 'warning'
        ? 'bg-amber-400'
        : 'bg-primary-container';
  const budgetTextColor =
    budgetStatus.state === 'over'
      ? 'text-error'
      : budgetStatus.state === 'warning'
        ? 'text-amber-400'
        : 'text-primary-container';

  const rows = useMemo(
    () =>
      [...scoped]
        .sort((a, b) => b.date.getTime() - a.date.getTime())
        .map((e) => resolveLabels(e, categories, subSources, subCategories)),
    [scoped, categories, subSources, subCategories],
  );

  const donutData = slices.map((s) => ({ name: s.name, value: s.total }));
  const showSplit = subScope === null && slices.length > 0;
  // Only worth a split chart when there's more than one bucket.
  const meaningfulSplit = showSplit && slices.length > 1;

  const heading = subScope === null ? categoryName : subScope.name;

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`${categoryName} insights`}
        data-testid="category-detail"
        className="w-full max-w-lg h-full flex flex-col bg-surface-container-lowest border-l border-outline-variant/30"
      >
        {/* Sticky header with breadcrumb + close. */}
        <div className="shrink-0 flex items-start justify-between gap-4 p-5 md:p-6 border-b border-outline-variant/20">
          <div className="flex items-center gap-3 min-w-0">
            <span className="shrink-0 w-11 h-11 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined" aria-hidden="true">
                {categoryIcon(categoryName)}
              </span>
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-1 text-label-caps uppercase text-on-surface-variant">
                {subScope !== null ? (
                  <>
                    <button
                      type="button"
                      onClick={() => setSubScope(null)}
                      data-testid="category-detail-breadcrumb"
                      className="hover:text-primary-container truncate"
                    >
                      {categoryName}
                    </button>
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      chevron_right
                    </span>
                  </>
                ) : (
                  <span>Category</span>
                )}
              </div>
              <h2 className="text-headline-md font-semibold text-on-surface truncate mt-0.5">
                {heading}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close insights"
            data-testid="category-detail-close"
            className="btn-ghost p-1.5 text-on-surface-variant hover:text-on-surface shrink-0"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        {/* Scrollable content. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-6 flex flex-col gap-5">
          {/* Hero: scope total + this-month delta. */}
          <div className="glass-card p-card_padding flex flex-col gap-3">
            <div className="flex items-end justify-between gap-4">
              <div>
                <span className="text-label-caps uppercase text-on-surface-variant">Total spent</span>
                <Money
                  amount={scopeTotal}
                  testId="category-detail-total"
                  className="block text-[clamp(28px,6vw,40px)] leading-none font-extrabold tracking-tighter text-white neon-glow mt-1"
                />
              </div>
              <span className="text-sm text-on-surface-variant">
                {rows.length} {rows.length === 1 ? 'txn' : 'txns'}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3 pt-3 border-t border-outline-variant/15">
              <span className="text-sm text-on-surface-variant">This month ({curKey})</span>
              <div className="flex items-center gap-3">
                <Money amount={currentTotal} className="font-mono-data text-sm text-on-surface" />
                {delta.percent === null ? (
                  <span className="text-xs text-on-surface-variant">new</span>
                ) : (
                  <span
                    className={`inline-flex items-center gap-1 text-xs font-medium ${
                      Math.abs(delta.percent) < 0.05
                        ? 'text-on-surface-variant'
                        : delta.percent > 0
                          ? 'text-error'
                          : 'text-primary-container'
                    }`}
                  >
                    <span className="material-symbols-outlined text-sm" aria-hidden="true">
                      {Math.abs(delta.percent) < 0.05
                        ? 'trending_flat'
                        : delta.percent > 0
                          ? 'trending_up'
                          : 'trending_down'}
                    </span>
                    {delta.percent > 0 ? '+' : ''}
                    {delta.percent.toFixed(1)}%
                  </span>
                )}
              </div>
            </div>
            {previousTotal > 0 && (
              <p className="text-xs text-on-surface-variant -mt-1">
                vs {formatINR(previousTotal)} last month ({prevKey})
              </p>
            )}

            {/* This scope's monthly budget progress, when one is set. */}
            {hasBudget && (
              <div
                className="flex flex-col gap-1.5 pt-3 border-t border-outline-variant/15"
                data-testid="category-detail-budget"
              >
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="text-on-surface-variant">Monthly budget</span>
                  <span className="font-mono-data text-on-surface">
                    {formatINR(currentTotal)}{' '}
                    <span className="text-on-surface-variant">
                      / {formatINR(budgetStatus.limit ?? 0)}
                    </span>
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                  <div
                    data-testid="category-detail-budget-bar"
                    className={`h-full rounded-full transition-[width] duration-500 ${budgetBarColor}`}
                    style={{
                      width: `${
                        budgetStatus.fraction === null
                          ? 0
                          : Math.min(budgetStatus.fraction * 100, 100)
                      }%`,
                    }}
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className={budgetTextColor}>
                    {budgetStatus.fraction !== null
                      ? `${(budgetStatus.fraction * 100).toFixed(0)}% used`
                      : ''}
                  </span>
                  <span className="text-on-surface-variant">
                    {budgetStatus.remaining !== null && budgetStatus.remaining >= 0
                      ? `${formatINR(budgetStatus.remaining)} left`
                      : `${formatINR(currentTotal - (budgetStatus.limit ?? 0))} over`}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Sub-category split (category scope only). */}
          {showSplit && (
            <div className="glass-card p-card_padding">
              <h3 className="text-headline-md font-semibold text-on-surface mb-1">
                Sub-category split
              </h3>
              <p className="text-sm text-on-surface-variant mb-4">
                Tap a sub-category to see its insights.
              </p>
              {meaningfulSplit && (
                <div className="w-40 h-40 mx-auto mb-4">
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
                          <Cell
                            key={entry.name}
                            fill={SLICE_COLORS[index % SLICE_COLORS.length]}
                          />
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
              )}
              <ul className="flex flex-col gap-2">
                {slices.map((slice, index) => {
                  const interactive = slice.id !== null;
                  return (
                    <li key={slice.id ?? '__none__'}>
                      <button
                        type="button"
                        disabled={!interactive}
                        onClick={
                          interactive
                            ? () => setSubScope({ id: slice.id, name: slice.name })
                            : undefined
                        }
                        data-testid="category-detail-subcategory"
                        className={`w-full flex items-center justify-between gap-3 rounded-lg px-2 py-2 text-left ${
                          interactive
                            ? 'hover:bg-surface-container-highest/60 cursor-pointer'
                            : 'cursor-default opacity-80'
                        }`}
                      >
                        <span className="flex items-center gap-2 min-w-0">
                          <span
                            className="w-2.5 h-2.5 rounded-full shrink-0"
                            style={{ background: SLICE_COLORS[index % SLICE_COLORS.length] }}
                          />
                          <span className="text-on-surface truncate">{slice.name}</span>
                          {interactive && (
                            <span className="material-symbols-outlined text-sm text-on-surface-variant" aria-hidden="true">
                              chevron_right
                            </span>
                          )}
                        </span>
                        <span className="flex items-center gap-2 shrink-0">
                          <Money amount={slice.total} className="font-mono-data text-sm text-on-surface" />
                          <span className="text-xs text-on-surface-variant w-9 text-right">
                            {(slice.fraction * 100).toFixed(0)}%
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Transactions in scope. */}
          <div className="glass-card p-card_padding">
            <h3 className="text-headline-md font-semibold text-on-surface mb-4">
              Transactions
            </h3>
            {rows.length === 0 ? (
              <p className="text-on-surface-variant text-sm">No transactions in this scope.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {rows.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center gap-3 rounded-lg bg-surface-container-highest/40 px-3 py-2.5"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-on-surface text-sm font-medium truncate">
                        {row.subCategoryName ??
                          (row.description.trim() !== '' ? row.description : categoryName)}
                      </p>
                      <p className="text-xs text-on-surface-variant truncate">
                        {formatDate(row.date)} · {row.sourceName}
                        {row.subSourceNickname !== undefined ? ` · ${row.subSourceNickname}` : ''}
                      </p>
                    </div>
                    <Money
                      amount={row.amount}
                      className="font-mono-data text-sm text-on-surface shrink-0"
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}
