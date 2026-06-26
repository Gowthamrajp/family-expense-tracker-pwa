/**
 * Pure sorting helpers for the expense list.
 *
 * Kept free of framework and I/O concerns so the logic can be shared across
 * layers and exercised by unit and property tests.
 */

import type { Expense } from './types';

/**
 * Order a collection of date-bearing records (e.g. {@link Expense} or Income)
 * by their `date` from most recent to least recent.
 *
 * Returns a new array that is a permutation of the input; the input array is
 * not mutated. Ordering is by `date` descending. The sort is stable, so
 * records sharing the same date preserve their original relative order.
 *
 * Validates: Requirements 3.4
 *
 * @param items - The records to order (any object with a `date: Date`).
 * @returns A new array ordered by date descending.
 */
export function sortByDateDesc<T extends { date: Date }>(items: T[]): T[] {
  return [...items].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
