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

/** Format a date as a "YYYY" year key. */
export function yearKey(date: Date): string {
  return date.getFullYear().toString().padStart(4, '0');
}

/** The "YYYY" key for the calendar year containing `date`. */
export function currentYearKey(date: Date): string {
  return yearKey(date);
}

/** The "YYYY" key for the year immediately before the one containing `date`. */
export function previousYearKey(date: Date): string {
  return (date.getFullYear() - 1).toString().padStart(4, '0');
}

/** Sum (in rupees) of expenses whose date falls in the given year key. */
export function totalForYear(expenses: Expense[], key: string): number {
  let cents = 0;
  for (const expense of expenses) {
    if (yearKey(expense.date) === key) {
      cents += toCents(expense.amount);
    }
  }
  return fromCents(cents);
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

/** Sum (in rupees) of records whose date falls in the given month key. */
export function totalForMonth(
  items: { amount: number; date: Date }[],
  key: string,
): number {
  let cents = 0;
  for (const item of items) {
    if (monthKey(item.date) === key) {
      cents += toCents(item.amount);
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

/** Granularity for a spending time series. */
export type SeriesGranularity = 'month' | 'year';

/** One point in a spending time series: a period key and its total. */
export interface SeriesPoint {
  /** Period key — "YYYY-MM" for month granularity, "YYYY" for year. */
  key: string;
  total: number;
}

/** The period key for a date at the given granularity. */
function periodKey(date: Date, granularity: SeriesGranularity): string {
  return granularity === 'year' ? yearKey(date) : monthKey(date);
}

/**
 * Step a "YYYY-MM" or "YYYY" period key back by `n` periods, returning the key
 * for that earlier period. Used to build a contiguous, gap-free axis ending at
 * the current period.
 */
function shiftPeriodKey(
  key: string,
  granularity: SeriesGranularity,
  back: number,
): string {
  if (granularity === 'year') {
    return (parseInt(key, 10) - back).toString().padStart(4, '0');
  }
  const [y, m] = key.split('-').map((s) => parseInt(s, 10));
  const d = new Date(y, m - 1 - back, 1);
  return monthKey(d);
}

/**
 * Build a contiguous spending time series ending at the period containing
 * `today` and spanning `periods` buckets (inclusive), optionally filtered by a
 * predicate (e.g. a single category or sub-category).
 *
 * Periods with no spend are included as zero so the line is continuous and the
 * x-axis is evenly spaced. Returned oldest-first.
 *
 * @param expenses all expenses to draw from
 * @param today reference date (the series ends at its period)
 * @param granularity month or year buckets
 * @param periods how many buckets to include (e.g. 6 months, 5 years)
 * @param predicate optional filter to scope the series (defaults to all)
 */
export function spendingSeries(
  expenses: Expense[],
  today: Date,
  granularity: SeriesGranularity,
  periods: number,
  predicate: (expense: Expense) => boolean = () => true,
): SeriesPoint[] {
  // Sum matching expenses into their period bucket.
  const centsByKey = new Map<string, number>();
  for (const expense of expenses) {
    if (!predicate(expense)) {
      continue;
    }
    const key = periodKey(expense.date, granularity);
    centsByKey.set(key, (centsByKey.get(key) ?? 0) + toCents(expense.amount));
  }

  // Build the contiguous axis ending at the current period, oldest-first.
  const endKey = periodKey(today, granularity);
  const points: SeriesPoint[] = [];
  for (let i = periods - 1; i >= 0; i -= 1) {
    const key = shiftPeriodKey(endKey, granularity, i);
    points.push({ key, total: fromCents(centsByKey.get(key) ?? 0) });
  }
  return points;
}
