/**
 * Budget configuration card for Family settings.
 *
 * Lets a member set and adjust the family's monthly budget at three levels:
 *
 * 1. Global — a single rolling cap for all spending (stored at
 *    `settings/budget` via {@link useBudget}).
 * 2. Per category — a cap for each {@link FamilyCategory}.
 * 3. Per sub-category — a cap for each {@link SubCategory}, nested under its
 *    parent category (both stored under `budgets/{id}` via
 *    {@link useScopedBudgets}).
 *
 * Each scope is edited inline by {@link BudgetScopeRow} with a Fixed-amount /
 * Percentage toggle (percent = a share of that scope's PREVIOUS-month spend),
 * a live limit preview, and Save/Clear. Category rows expand to reveal their
 * sub-category budgets. Mirrors the Stitch "Budget Configuration" design's
 * global limit + per-category breakdown.
 */
import { useMemo, useState } from 'react';

import { useAuth } from '../state/AuthProvider';
import { useBudget } from '../state/useBudget';
import { useCategories } from '../state/useCategories';
import { useExpenses } from '../state/useExpenses';
import { useScopedBudgets } from '../state/useScopedBudgets';
import { useSubCategories } from '../state/useSubCategories';
import { scopedTotalForMonth } from '../domain/budget';
import { monthKey, currentMonthKey, previousMonthKey } from '../domain/insights';
import type { BudgetMode } from '../domain/types';
import { Loader } from './Loader';
import { BudgetScopeRow, type ScopeBudgetValue } from './BudgetScopeRow';
import { CollapsibleCard } from './CollapsibleCard';

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

function categoryIcon(name: string): string {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(name)) {
      return icon;
    }
  }
  return 'category';
}

/** Props for {@link BudgetManager}. */
export interface BudgetManagerProps {
  /** Active family id, or `null` while no family is resolved. */
  familyId: string | null;
}

/** Render the multi-level budget configuration card. */
export function BudgetManager({ familyId }: BudgetManagerProps): JSX.Element {
  const { member } = useAuth();
  const { budget, status, setBudget, clearBudget } = useBudget(familyId, member);
  const { expenses } = useExpenses(familyId);
  const { categories } = useCategories(familyId);
  const { subCategories, forCategory: subsForCategory } = useSubCategories(familyId);
  const {
    forCategory: budgetForCategory,
    forSubCategory: budgetForSubCategory,
    setCategoryBudget,
    setSubCategoryBudget,
    clearCategoryBudget,
    clearSubCategoryBudget,
  } = useScopedBudgets(familyId, member);

  // Which category rows are expanded to show their sub-category budgets.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const today = new Date();
  const prevKey = previousMonthKey(today);
  const curKey = currentMonthKey(today);

  // Previous-month totals per scope, used for percent-mode previews. Computed
  // once per expenses/category change rather than per row.
  const prevTotals = useMemo(() => {
    const global = scopedTotalForMonth(expenses, monthKey, prevKey, () => true);
    const byCategory = new Map<string, number>();
    const bySubCategory = new Map<string, number>();
    for (const cat of categories) {
      byCategory.set(
        cat.id,
        scopedTotalForMonth(expenses, monthKey, prevKey, (e) => e.categoryId === cat.id),
      );
    }
    for (const sub of subCategories) {
      bySubCategory.set(
        sub.id,
        scopedTotalForMonth(expenses, monthKey, prevKey, (e) => e.subCategoryId === sub.id),
      );
    }
    return { global, byCategory, bySubCategory };
  }, [expenses, categories, subCategories, prevKey]);

  const globalCurrent: ScopeBudgetValue | null =
    budget === null
      ? null
      : { mode: budget.mode, amount: budget.amount, percent: budget.percent };

  const toggleExpanded = (categoryId: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) {
        next.delete(categoryId);
      } else {
        next.add(categoryId);
      }
      return next;
    });
  };

  return (
    <CollapsibleCard
      title="Monthly budgets"
      icon="account_balance_wallet"
      subtitle="Caps overall, per category, and per sub-category"
      testId="budget-manager"
    >

      {status === 'loading' ? (
        <Loader label="Loading budgets…" />
      ) : (
        <>
          {status === 'error' && (
            <p role="alert" className="text-error">
              The budget could not be loaded.
            </p>
          )}

          {/* Global budget. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
              Overall
            </h3>
            <BudgetScopeRow
              label="All spending"
              icon="account_balance_wallet"
              previousTotal={prevTotals.global}
              monthKey={curKey}
              current={globalCurrent}
              testIdPrefix="budget-global"
              onSave={async (mode: BudgetMode, raw: string) => {
                const r = await setBudget(mode, raw);
                return { ok: r.ok, errorKind: r.ok ? undefined : r.error.kind };
              }}
              onClear={clearBudget}
            />
          </div>

          {/* Per-category (and nested per-sub-category) budgets. */}
          <div className="flex flex-col gap-2">
            <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
              By category
            </h3>
            {categories.length === 0 ? (
              <p className="text-on-surface-variant text-sm">No categories yet.</p>
            ) : (
              <ul className="flex flex-col gap-2">
                {categories.map((cat) => {
                  const subs = subsForCategory(cat.id);
                  const isExpanded = expanded.has(cat.id);
                  const catBudget = budgetForCategory(cat.id);
                  const catCurrent: ScopeBudgetValue | null = catBudget
                    ? { mode: catBudget.mode, amount: catBudget.amount, percent: catBudget.percent }
                    : null;
                  return (
                    <li key={cat.id} className="flex flex-col gap-2">
                      <BudgetScopeRow
                        label={cat.name}
                        icon={categoryIcon(cat.name)}
                        previousTotal={prevTotals.byCategory.get(cat.id) ?? 0}
                        monthKey={curKey}
                        current={catCurrent}
                        testIdPrefix={`budget-cat-${cat.id}`}
                        onSave={async (mode: BudgetMode, raw: string) => {
                          const r = await setCategoryBudget(cat.id, mode, raw);
                          return { ok: r.ok, errorKind: r.ok ? undefined : r.error.kind };
                        }}
                        onClear={() => clearCategoryBudget(cat.id)}
                      />
                      {subs.length > 0 && (
                        <div className="ml-4 flex flex-col gap-2">
                          <button
                            type="button"
                            onClick={() => toggleExpanded(cat.id)}
                            aria-expanded={isExpanded}
                            data-testid={`budget-cat-${cat.id}-subs-toggle`}
                            className="self-start text-xs text-primary-container inline-flex items-center gap-1 hover:opacity-80"
                          >
                            <span className="material-symbols-outlined text-sm" aria-hidden="true">
                              {isExpanded ? 'expand_less' : 'expand_more'}
                            </span>
                            {isExpanded ? 'Hide' : 'Show'} {subs.length} sub-categor
                            {subs.length === 1 ? 'y' : 'ies'}
                          </button>
                          {isExpanded &&
                            subs.map((sub) => {
                              const subBudget = budgetForSubCategory(sub.id);
                              const subCurrent: ScopeBudgetValue | null = subBudget
                                ? {
                                    mode: subBudget.mode,
                                    amount: subBudget.amount,
                                    percent: subBudget.percent,
                                  }
                                : null;
                              return (
                                <BudgetScopeRow
                                  key={sub.id}
                                  label={sub.name}
                                  icon="sell"
                                  nested
                                  previousTotal={prevTotals.bySubCategory.get(sub.id) ?? 0}
                                  monthKey={curKey}
                                  current={subCurrent}
                                  testIdPrefix={`budget-sub-${sub.id}`}
                                  onSave={async (mode: BudgetMode, raw: string) => {
                                    const r = await setSubCategoryBudget(
                                      sub.id,
                                      cat.id,
                                      mode,
                                      raw,
                                    );
                                    return {
                                      ok: r.ok,
                                      errorKind: r.ok ? undefined : r.error.kind,
                                    };
                                  }}
                                  onClear={() => clearSubCategoryBudget(sub.id)}
                                />
                              );
                            })}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </CollapsibleCard>
  );
}
