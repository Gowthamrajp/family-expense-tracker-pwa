/**
 * Pure scheduling logic for recurring payments.
 *
 * The app has no server scheduler, so recurring Expenses are materialized on
 * the client when a member opens the app: given a {@link RecurringRule} and the
 * current date, this module computes exactly which occurrence dates are now due
 * but not yet generated. The data layer then writes one Expense per due date
 * and advances the rule's `lastRunDate`, which makes generation idempotent and
 * lets it catch up on periods missed while the app was closed.
 *
 * Framework- and I/O-free so it can be unit- and property-tested without
 * Firebase or the DOM.
 */

import type { RecurringFrequency, RecurringRule } from './types';

/** Strip a Date to local midnight so comparisons ignore time-of-day. */
function atMidnight(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/** Whether date `a` is strictly after date `b` (date-only comparison). */
function isAfter(a: Date, b: Date): boolean {
  return atMidnight(a).getTime() > atMidnight(b).getTime();
}

/**
 * Advance a date by one period of the given frequency.
 *
 * - `weekly`: +7 days.
 * - `monthly`: +1 calendar month, clamped to the last valid day of the target
 *   month (so a rule starting on the 31st falls back to the 30th/28th in
 *   shorter months rather than overflowing into the next month).
 */
export function advance(date: Date, frequency: RecurringFrequency): Date {
  if (frequency === 'weekly') {
    const next = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 7);
    return next;
  }
  // monthly: clamp the day to the target month's length.
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  const targetMonthLastDay = new Date(year, month + 2, 0).getDate();
  const clampedDay = Math.min(day, targetMonthLastDay);
  return new Date(year, month + 1, clampedDay);
}

/**
 * Maximum occurrences generated in a single catch-up pass. A guard against a
 * rule with a far-past start date producing an unbounded burst of Expenses.
 */
export const MAX_OCCURRENCES_PER_RUN = 60;

/**
 * Compute the occurrence dates that are due for `rule` as of `today` but have
 * not yet been materialized.
 *
 * An occurrence on date D is due when `D <= today`. Generation resumes from the
 * period after `lastRunDate` (or from `startDate` when nothing has run yet).
 * Returns the dates in chronological order (possibly empty). Inactive rules and
 * rules whose first occurrence is still in the future yield no dates. The
 * result is capped at {@link MAX_OCCURRENCES_PER_RUN}.
 *
 * Pure: `today` is a parameter so the function is deterministic for testing.
 */
export function dueOccurrences(rule: RecurringRule, today: Date): Date[] {
  if (!rule.active) {
    return [];
  }

  const todayMid = atMidnight(today);
  const occurrences: Date[] = [];

  // The next candidate occurrence is the period after lastRunDate, or the
  // startDate itself when nothing has been generated yet.
  let candidate =
    rule.lastRunDate === null
      ? atMidnight(rule.startDate)
      : advance(atMidnight(rule.lastRunDate), rule.frequency);

  while (
    !isAfter(candidate, todayMid) &&
    occurrences.length < MAX_OCCURRENCES_PER_RUN
  ) {
    occurrences.push(candidate);
    candidate = advance(candidate, rule.frequency);
  }

  return occurrences;
}
