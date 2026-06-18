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

/** Day-based step for each frequency, or null when it is month-based. */
const DAY_STEP: Partial<Record<RecurringFrequency, number>> = {
  daily: 1,
  weekly: 7,
};

/** Month-based step for each frequency, or null when it is day-based. */
const MONTH_STEP: Partial<Record<RecurringFrequency, number>> = {
  monthly: 1,
  bimonthly: 2,
  quarterly: 3,
  'half-yearly': 6,
  yearly: 12,
};

/**
 * Advance a date by one period of the given frequency.
 *
 * - Day-based (`daily` +1 day, `weekly` +7 days): straightforward day math.
 * - Month-based (`monthly` +1, `bimonthly` +2, `quarterly` +3,
 *   `half-yearly` +6, `yearly` +12 months): the day-of-month is clamped to the
 *   last valid day of the target month (so a rule starting on the 31st falls
 *   back to the 30th/28th in shorter months rather than overflowing into the
 *   next month).
 */
export function advance(date: Date, frequency: RecurringFrequency): Date {
  const dayStep = DAY_STEP[frequency];
  if (dayStep !== undefined) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + dayStep);
  }

  const monthStep = MONTH_STEP[frequency] ?? 1;
  const year = date.getFullYear();
  const month = date.getMonth();
  const day = date.getDate();
  // Last day of the target month: day 0 of the month AFTER the target.
  const targetMonthLastDay = new Date(year, month + monthStep + 1, 0).getDate();
  const clampedDay = Math.min(day, targetMonthLastDay);
  return new Date(year, month + monthStep, clampedDay);
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
