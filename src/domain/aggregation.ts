/**
 * Aggregation logic for the Dashboard.
 *
 * All sums are computed in integer cents to avoid binary floating-point
 * rounding errors, then converted back to a 2-decimal number for display.
 * This keeps totals exact for the validated amount range (0.01 ..
 * 999,999,999.99 with at most 2 decimal places). See design "Amount
 * precision note" and "Correctness Properties" (Properties 7 and 8).
 */

import type { Expense, GroupTotal } from './types';

/** Convert a 2-decimal amount to an exact integer number of cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents back to a 2-decimal number. */
function fromCents(cents: number): number {
  return cents / 100;
}

/**
 * Sum of the amounts of all expenses, computed in integer cents.
 * Returns 0 for an empty collection. Validates Requirement 4.1.
 */
export function totalAmount(expenses: Expense[]): number {
  const totalCents = expenses.reduce((sum, expense) => sum + toCents(expense.amount), 0);
  return fromCents(totalCents);
}

/**
 * Group expense totals by a derived key. Produces exactly one entry per
 * distinct key present in the collection, preserving first-seen key order.
 * Sums are accumulated in integer cents and converted back per group.
 */
function groupBy(expenses: Expense[], keyOf: (expense: Expense) => string): GroupTotal[] {
  const centsByKey = new Map<string, number>();

  for (const expense of expenses) {
    const key = keyOf(expense);
    const current = centsByKey.get(key) ?? 0;
    centsByKey.set(key, current + toCents(expense.amount));
  }

  const groups: GroupTotal[] = [];
  for (const [key, cents] of centsByKey) {
    groups.push({ key, total: fromCents(cents) });
  }
  return groups;
}

/**
 * Total expense amount grouped by Category, one group per Category that has
 * at least one associated expense. Validates Requirement 4.2.
 */
export function groupByCategory(expenses: Expense[]): GroupTotal[] {
  return groupBy(expenses, (expense) => expense.category);
}

/**
 * Total expense amount grouped by Source, one group per Source that has at
 * least one associated expense. Validates Requirement 4.3.
 */
export function groupBySource(expenses: Expense[]): GroupTotal[] {
  return groupBy(expenses, (expense) => expense.source);
}

/** Format an expense date as a "YYYY-MM" calendar-month key. */
function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
}

/**
 * Total expense amount grouped by calendar month using "YYYY-MM" keys, one
 * group per calendar month that has at least one recorded expense.
 * Validates Requirement 4.4.
 */
export function groupByMonth(expenses: Expense[]): GroupTotal[] {
  return groupBy(expenses, (expense) => monthKey(expense.date));
}

/**
 * Total expense amount grouped by a stable reference id (e.g. `categoryId` or
 * `subCategoryId`), resolving each id to a display label via `labelOf`.
 *
 * Grouping by id (not by display name) keeps each logical category in exactly
 * one bucket regardless of legacy name strings or renames, which is what makes
 * the distribution accurate. Expenses whose id is absent fall into a single
 * bucket keyed by `fallbackKey` (e.g. "Uncategorized") rather than scattering
 * across stale name strings.
 *
 * @param expenses the expenses to group
 * @param idOf extracts the grouping id from an expense, or undefined when absent
 * @param labelOf resolves a present id to its display label
 * @param fallbackKey label for expenses with no id
 */
export function groupByReference(
  expenses: Expense[],
  idOf: (expense: Expense) => string | undefined,
  labelOf: (id: string) => string,
  fallbackKey: string,
): GroupTotal[] {
  const centsByLabel = new Map<string, number>();
  for (const expense of expenses) {
    const id = idOf(expense);
    const label = id === undefined ? fallbackKey : labelOf(id);
    centsByLabel.set(label, (centsByLabel.get(label) ?? 0) + toCents(expense.amount));
  }
  const groups: GroupTotal[] = [];
  for (const [key, cents] of centsByLabel) {
    groups.push({ key, total: fromCents(cents) });
  }
  return groups;
}
