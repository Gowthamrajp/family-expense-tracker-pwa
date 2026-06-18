/**
 * Monthly budget pure logic for the Family Expense Tracker.
 *
 * A family sets a single, rolling monthly budget that applies to every calendar
 * month. The target can be expressed two ways (Req: "set budget for the month,
 * by percentage or by amount"):
 *
 * - `amount`: a fixed rupee cap for the month (e.g. ₹40,000/month), or
 * - `percent`: a percentage of the PREVIOUS month's total spend (e.g. 90% =
 *   "spend at most 90% of what we spent last month"), which makes the cap track
 *   actual spending without manual updates.
 *
 * This module is framework- and I/O-free so the rules can be unit-tested
 * without Firebase or the DOM. All money math is done in integer paise (cents)
 * to avoid floating-point drift, consistent with {@link ./aggregation} and
 * {@link ./insights}.
 */

import type { Budget, BudgetMode, Result } from './types';
import { err, ok } from './types';

/** Fraction of the limit at/above which spending is flagged as "warning". */
export const BUDGET_WARNING_FRACTION = 0.8;

/** Maximum supported monthly budget amount (mirrors the expense amount cap). */
export const MAX_BUDGET_AMOUNT = 999_999_999.99;

/** Maximum supported percent-of-previous-month value. */
export const MAX_BUDGET_PERCENT = 1000;

/** Convert a 2-decimal amount to exact integer paise. */
function toPaise(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer paise back to a 2-decimal number. */
function fromPaise(paise: number): number {
  return paise / 100;
}

/** Reasons a proposed budget can be rejected. Discriminated by `kind`. */
export type BudgetError =
  | { kind: 'required' }
  | { kind: 'not-numeric' }
  | { kind: 'too-small' }
  | { kind: 'too-large' };

/**
 * Validate a raw budget value for the given mode, returning the parsed numeric
 * value on success. Amount must be within (0, {@link MAX_BUDGET_AMOUNT}];
 * percent must be within (0, {@link MAX_BUDGET_PERCENT}].
 */
export function validateBudgetValue(
  mode: BudgetMode,
  raw: string,
): Result<number, BudgetError> {
  const trimmed = raw.trim();
  if (trimmed === '') {
    return err({ kind: 'required' });
  }
  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return err({ kind: 'not-numeric' });
  }
  if (value <= 0) {
    return err({ kind: 'too-small' });
  }
  const max = mode === 'amount' ? MAX_BUDGET_AMOUNT : MAX_BUDGET_PERCENT;
  if (value > max) {
    return err({ kind: 'too-large' });
  }
  return ok(value);
}

/**
 * Compute the effective rupee limit for a month from the family's budget and
 * the previous month's total spend.
 *
 * - `amount` mode: the configured amount, independent of history.
 * - `percent` mode: `previousMonthTotal * percent / 100`. When there is no
 *   previous-month spend (baseline 0) the limit is 0, which callers surface as
 *   "no baseline yet" rather than an immediate over-budget state.
 *
 * Returns `null` when the budget is malformed (no usable value for its mode).
 */
export function effectiveMonthlyLimit(
  budget: Budget,
  previousMonthTotal: number,
): number | null {
  return effectiveLimit(budget.mode, budget.amount, budget.percent, previousMonthTotal);
}

/**
 * Shared effective-limit derivation used by both the global {@link Budget} and
 * scoped budgets. In `amount` mode returns the fixed amount; in `percent` mode
 * returns `previousTotal * percent / 100`. Returns `null` when the value for
 * the mode is missing or non-positive.
 */
export function effectiveLimit(
  mode: BudgetMode,
  amount: number | undefined,
  percent: number | undefined,
  previousTotal: number,
): number | null {
  if (mode === 'amount') {
    return amount !== undefined && amount > 0 ? amount : null;
  }
  if (percent === undefined || percent <= 0) {
    return null;
  }
  return fromPaise(Math.round(toPaise(previousTotal) * (percent / 100)));
}

/** Build the stable `budgets/{id}` document id for a category-scoped budget. */
export function categoryBudgetDocId(categoryId: string): string {
  return `cat_${categoryId}`;
}

/** Build the stable `budgets/{id}` document id for a sub-category budget. */
export function subCategoryBudgetDocId(subCategoryId: string): string {
  return `sub_${subCategoryId}`;
}

/**
 * Sum (in rupees) of the expenses matching `predicate` whose date falls in the
 * given "YYYY-MM" month key. Cents-accurate. Used to compute per-category and
 * per-sub-category spend for scoped budgets.
 */
export function scopedTotalForMonth(
  expenses: { amount: number; date: Date; categoryId?: string; subCategoryId?: string }[],
  monthKeyOf: (date: Date) => string,
  key: string,
  predicate: (e: { categoryId?: string; subCategoryId?: string }) => boolean,
): number {
  let paise = 0;
  for (const e of expenses) {
    if (monthKeyOf(e.date) === key && predicate(e)) {
      paise += toPaise(e.amount);
    }
  }
  return fromPaise(paise);
}

/** Spending state relative to a budget limit. */
export type BudgetState = 'under' | 'warning' | 'over';

/** A computed budget progress snapshot for a month. */
export interface BudgetStatus {
  /** Effective rupee limit for the month, or null when not derivable. */
  limit: number | null;
  /** Amount spent in the month so far. */
  spent: number;
  /** limit - spent (can be negative when over); null when no limit. */
  remaining: number | null;
  /** spent / limit in [0, ∞); null when no limit or limit is 0. */
  fraction: number | null;
  /** Coarse state used for color/iconography. */
  state: BudgetState;
}

/**
 * Compute a {@link BudgetStatus} for a month given the spend so far and the
 * effective limit. With no usable limit (null) or a zero limit the state is
 * `under` (nothing to exceed yet). Otherwise `over` when spend exceeds the
 * limit, `warning` at/above {@link BUDGET_WARNING_FRACTION}, else `under`.
 */
export function computeBudgetStatus(
  spent: number,
  limit: number | null,
): BudgetStatus {
  if (limit === null || limit <= 0) {
    return { limit, spent, remaining: limit === null ? null : limit - spent, fraction: null, state: 'under' };
  }
  const fraction = toPaise(spent) / toPaise(limit);
  const remaining = fromPaise(toPaise(limit) - toPaise(spent));
  let state: BudgetState = 'under';
  if (toPaise(spent) > toPaise(limit)) {
    state = 'over';
  } else if (fraction >= BUDGET_WARNING_FRACTION) {
    state = 'warning';
  }
  return { limit, spent, remaining, fraction, state };
}
