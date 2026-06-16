/**
 * Pure in-use decision logic for category and sub-source deletion.
 *
 * Deleting a category (Req 4.7–4.9) or a sub-source (Req 5.8–5.10) is permitted
 * only when no Expense in the family still references it, and a blocked delete
 * must report exactly how many Expenses reference it. This module holds the
 * shared, framework- and I/O-free decision: given a collection of Expenses, a
 * reference dimension, and a target id, it returns the exact reference count
 * and whether the target is deletable.
 *
 * The data layer's `getCountFromServer`-based count (see design "In-use
 * reference counting") mirrors this pure logic; keeping the decision here lets
 * it be unit- and property-tested independent of Firebase and the DOM.
 *
 * See design "In-use reference counting" and Property 15.
 */

import type { Expense } from './types';

/**
 * The Expense reference field a deletion decision is evaluated against:
 * - `'categoryId'` for category deletion (Req 4.8, 4.9), and
 * - `'subSourceId'` for sub-source deletion (Req 5.9, 5.10).
 */
export type InUseDimension = 'categoryId' | 'subSourceId';

/**
 * Outcome of an in-use evaluation.
 *
 * `count` is the exact number of Expenses referencing the target id along the
 * chosen dimension (surfaced in the in-use message, Req 4.9, 5.10).
 * `deletable` is `true` if and only if `count === 0` (Req 4.8, 5.9).
 */
export interface InUseDecision {
  count: number;
  deletable: boolean;
}

/**
 * Count the Expenses that reference `id` along `dimension` and decide whether
 * the target may be deleted.
 *
 * An Expense references the target when its value for `dimension` strictly
 * equals `id`. Because `subSourceId` is optional on an Expense, an absent value
 * never matches a target id. The returned `deletable` flag is exactly
 * `count === 0`, so a target is deletable if and only if nothing references it
 * (Req 4.8, 4.9, 5.9, 5.10; Property 15).
 *
 * @param expenses the family's Expenses to scan
 * @param dimension which Expense reference field to compare against
 * @param id the target category or sub-source id
 * @returns the exact reference {@link InUseDecision.count} and a
 *   {@link InUseDecision.deletable} flag true iff the count is zero
 */
export function evaluateInUse(
  expenses: Expense[],
  dimension: InUseDimension,
  id: string,
): InUseDecision {
  let count = 0;
  for (const expense of expenses) {
    if (expense[dimension] === id) {
      count += 1;
    }
  }
  return { count, deletable: count === 0 };
}
