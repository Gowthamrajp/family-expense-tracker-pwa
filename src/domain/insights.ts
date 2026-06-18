/**
 * Pure analytics helpers for the Insights screen.
 *
 * These build on the existing aggregation primitives but add the
 * month-over-month comparisons the Insights UI needs: current-month vs
 * previous-month totals, per-category deltas, and category share of spend.
 * Framework- and I/O-free so they can be unit-tested without the DOM.
 */

import type { Expense } from './types';

/** Convert a 2-decimal amount to exact integer cents. */
function toCents(amount: number): number {
  return Math.round(amount * 100);
}

/** Convert integer cents back to a 2-decimal number. */
function fromCents(cents: number): number {
  return cents / 100;
}

/** Format a date as a "YYYY-MM" month key. */
export function monthKey(date: Date): string {
  const year = date.getFullYear();
  const month = date.getMonth() + 1;
  return `${year.toString().padStart(4, '0')}-${month.toString().padStart(2, '0')}`;
}

/** The "YYYY-MM" key for the calendar month containing `date`. */
export function currentMonthKey(date: Date): string {
  return monthKey(date);
}

/** The "YYYY-MM" key for the month immediately before the one containing `date`. */
export function previousMonthKey(date: Date): string {
  const prev = new Date(date.getFullYear(), date.getMonth() - 1, 1);
  return monthKey(prev);
}

/** Sum (in rupees) of expenses whose date falls in the given month key. */
export function totalForMonth(expenses: Expense[], key: string): number {
  let cents = 0;
  for (const expense of expenses) {
    if (monthKey(expense.date) === key) {
      cents += toCents(expense.amount);
    }
  }
  return fromCents(cents);
}

/**
 * A percent-change figure between two totals.
 * - `null` percent means the previous total was zero (no baseline), so a
 *   percentage is undefined; callers render this as "new" / "—".
 */
export interface Delta {
  current: number;
  previous: number;
  /** (current - previous) / previous * 100, or null when previous is 0. */
  percent: number | null;
}

/** Compute the percent-change delta between current and previous totals. */
export function computeDelta(current: number, previous: number): Delta {
  const percent =
    previous === 0 ? null : ((current - previous) / previous) * 100;
  return { current, previous, percent };
}

/** A category's share of total spend, for the distribution donut/legend. */
export interface CategoryShare {
  /** Category display label (resolved name or legacy string). */
  key: string;
  total: number;
  /** Fraction of the grand total in [0, 1]; 0 when the grand total is 0. */
  fraction: number;
}

/**
 * Compute each category's share of total spend across all provided expenses,
 * sorted by total descending. Groups by a stable id (via `idOf`) and resolves
 * the display label via `labelOf`, so renames/legacy strings never fragment a
 * category into multiple slices. Expenses with no id use `fallbackKey`.
 */
export function categoryShares(
  expenses: Expense[],
  idOf: (expense: Expense) => string | undefined,
  labelOf: (id: string) => string,
  fallbackKey: string,
): CategoryShare[] {
  const centsByKey = new Map<string, number>();
  let grandCents = 0;
  for (const expense of expenses) {
    const id = idOf(expense);
    const key = id === undefined ? fallbackKey : labelOf(id);
    const cents = toCents(expense.amount);
    centsByKey.set(key, (centsByKey.get(key) ?? 0) + cents);
    grandCents += cents;
  }
  const shares: CategoryShare[] = [];
  for (const [key, cents] of centsByKey) {
    shares.push({
      key,
      total: fromCents(cents),
      fraction: grandCents === 0 ? 0 : cents / grandCents,
    });
  }
  shares.sort((a, b) => b.total - a.total);
  return shares;
}

/** A per-category month-over-month comparison row. */
export interface CategoryComparison {
  key: string;
  current: number;
  previous: number;
  percent: number | null;
}

/**
 * Compare per-category spend between the current and previous month.
 * Returns one row per category seen in either month, sorted by current spend
 * descending. Groups by stable id (`idOf`) resolved to a label (`labelOf`);
 * expenses without an id use `fallbackKey`.
 */
export function categoryComparison(
  expenses: Expense[],
  today: Date,
  idOf: (expense: Expense) => string | undefined,
  labelOf: (id: string) => string,
  fallbackKey: string,
): CategoryComparison[] {
  const curKey = currentMonthKey(today);
  const prevKey = previousMonthKey(today);
  const current = new Map<string, number>();
  const previous = new Map<string, number>();

  for (const expense of expenses) {
    const mk = monthKey(expense.date);
    const id = idOf(expense);
    const label = id === undefined ? fallbackKey : labelOf(id);
    const cents = toCents(expense.amount);
    if (mk === curKey) {
      current.set(label, (current.get(label) ?? 0) + cents);
    } else if (mk === prevKey) {
      previous.set(label, (previous.get(label) ?? 0) + cents);
    }
  }

  const keys = new Set<string>([...current.keys(), ...previous.keys()]);
  const rows: CategoryComparison[] = [];
  for (const key of keys) {
    const cur = fromCents(current.get(key) ?? 0);
    const prev = fromCents(previous.get(key) ?? 0);
    const percent = prev === 0 ? null : ((cur - prev) / prev) * 100;
    rows.push({ key, current: cur, previous: prev, percent });
  }
  rows.sort((a, b) => b.current - a.current);
  return rows;
}
