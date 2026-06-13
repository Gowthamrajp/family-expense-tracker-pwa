/**
 * Pure sorting helpers for the expense list.
 *
 * Kept free of framework and I/O concerns so the logic can be shared across
 * layers and exercised by unit and property tests.
 */

import type { Expense } from './types';

/**
 * Order a collection of {@link Expense} records by their Expense date from
 * most recent to least recent.
 *
 * Returns a new array that is a permutation of the input; the input array is
 * not mutated. Ordering is by `date` descending. The sort is stable, so
 * expenses sharing the same date preserve their original relative order.
 *
 * Validates: Requirements 3.4
 *
 * @param expenses - The expenses to order.
 * @returns A new array ordered by Expense date descending.
 */
export function sortByDateDesc(expenses: Expense[]): Expense[] {
  return [...expenses].sort(
    (a, b) => b.date.getTime() - a.date.getTime(),
  );
}
