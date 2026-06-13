/**
 * Pure validation functions for the Expense_Entry form.
 *
 * Each validator takes raw user input (typically a form string) and returns a
 * {@link Result} carrying either the parsed/validated value or a per-field
 * error. The error types are discriminated unions so they can be composed into
 * a single `FieldErrors` aggregate by `validateExpenseForm` (see design
 * "Domain Layer (pure functions)").
 */

import {
  type Category,
  type Source,
  type ExpenseInput,
  type Result,
  CATEGORIES,
  SOURCES,
  ok,
  err,
} from './types';

/** Smallest accepted expense amount (inclusive). See Requirement 2.2. */
export const MIN_AMOUNT = 0.01;
/** Largest accepted expense amount (inclusive). See Requirement 2.2. */
export const MAX_AMOUNT = 999_999_999.99;
/** Maximum number of decimal places allowed on an amount. */
export const MAX_AMOUNT_DECIMALS = 2;
/** Maximum description length in characters. See Requirement 2.1. */
export const MAX_DESCRIPTION_LENGTH = 280;

/** Earliest accepted expense date (inclusive), as `YYYY-MM-DD`. See Requirement 2.8. */
export const MIN_DATE = '2000-01-01';
/** Earliest accepted expense date as a comparable `YYYYMMDD` integer. */
const MIN_DATE_NUMBER = 2000_01_01;

/**
 * Why an amount input was rejected. Discriminated by `kind` so the UI can
 * render an appropriate message and so it can compose into `FieldErrors`.
 *
 * Validates: Requirements 2.2, 2.4
 */
export type AmountError =
  | { kind: 'required' }
  | { kind: 'not-numeric' }
  | { kind: 'too-small'; min: number }
  | { kind: 'too-large'; max: number }
  | { kind: 'too-many-decimals'; max: number };

/**
 * Why a description input was rejected. Discriminated by `kind` for
 * consistency with the other field errors and to allow composition into
 * `FieldErrors`.
 *
 * Validates: Requirement 2.1
 */
export type DescError = {
  kind: 'too-long';
  max: number;
  actual: number;
};

/**
 * Why a date input was rejected. Discriminated by `kind` for consistency with
 * the other field errors and to allow composition into `FieldErrors`.
 *
 * Note: an empty date input is *not* an error — it defaults to the current
 * date (Requirement 2.7), so there is no `required` variant here.
 *
 * Validates: Requirement 2.8
 */
export type DateError =
  | { kind: 'not-a-date' }
  | { kind: 'too-early'; min: string }
  | { kind: 'in-future' };

/** Matches a plain decimal number with an optional leading sign. */
const NUMERIC_PATTERN = /^[+-]?\d+(\.\d+)?$/;

/** Matches a strict `YYYY-MM-DD` calendar date with zero-padded fields. */
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * Validate a raw amount string.
 *
 * Succeeds if and only if the value is numeric, greater than or equal to
 * {@link MIN_AMOUNT}, less than or equal to {@link MAX_AMOUNT}, and has at most
 * {@link MAX_AMOUNT_DECIMALS} decimal places. Any other input (empty,
 * non-numeric, below the minimum, above the maximum, or with too many decimal
 * places) is rejected with an {@link AmountError}.
 *
 * Validates: Requirements 2.2, 2.4
 */
export function validateAmount(raw: string): Result<number, AmountError> {
  const trimmed = raw.trim();

  if (trimmed === '') {
    return err({ kind: 'required' });
  }

  if (!NUMERIC_PATTERN.test(trimmed)) {
    return err({ kind: 'not-numeric' });
  }

  const value = Number(trimmed);
  if (!Number.isFinite(value)) {
    return err({ kind: 'not-numeric' });
  }

  const decimals = decimalPlaces(trimmed);
  if (decimals > MAX_AMOUNT_DECIMALS) {
    return err({ kind: 'too-many-decimals', max: MAX_AMOUNT_DECIMALS });
  }

  if (value < MIN_AMOUNT) {
    return err({ kind: 'too-small', min: MIN_AMOUNT });
  }

  if (value > MAX_AMOUNT) {
    return err({ kind: 'too-large', max: MAX_AMOUNT });
  }

  return ok(value);
}

/**
 * Validate a raw description string.
 *
 * Succeeds for any input from 0 up to {@link MAX_DESCRIPTION_LENGTH}
 * characters (an empty description is allowed). The value is returned
 * unchanged on success. Length is measured in Unicode code points so
 * multi-code-unit characters (for example emoji) count as one character.
 *
 * Validates: Requirement 2.1
 */
export function validateDescription(raw: string): Result<string, DescError> {
  const length = Array.from(raw).length;

  if (length > MAX_DESCRIPTION_LENGTH) {
    return err({ kind: 'too-long', max: MAX_DESCRIPTION_LENGTH, actual: length });
  }

  return ok(raw);
}

/**
 * Count the number of digits after the decimal point in a numeric string that
 * has already matched {@link NUMERIC_PATTERN}.
 */
function decimalPlaces(numeric: string): number {
  const dot = numeric.indexOf('.');
  return dot === -1 ? 0 : numeric.length - dot - 1;
}

/**
 * Validate a raw date string against the allowed expense date range.
 *
 * An empty or `null` input is not an error: it defaults to the provided
 * `today` (Requirement 2.7). A non-empty input must be a strict `YYYY-MM-DD`
 * calendar date (so non-existent dates such as `2021-02-30` are rejected) that
 * falls in the inclusive range {@link MIN_DATE} (2000-01-01) through `today`.
 * Dates earlier than the minimum or later than `today` are rejected with a
 * {@link DateError} (Requirement 2.8).
 *
 * `today` is taken as a parameter (rather than read from the system clock) so
 * the function stays pure and deterministic for testing.
 *
 * Validates: Requirements 2.7, 2.8
 */
export function validateDate(
  raw: string | null,
  today: Date,
): Result<Date, DateError> {
  if (raw === null || raw.trim() === '') {
    return ok(today);
  }

  const match = DATE_PATTERN.exec(raw.trim());
  if (match === null) {
    return err({ kind: 'not-a-date' });
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  // Construct in local time and confirm the components round-trip, which
  // rejects non-calendar dates such as 2021-02-30 or 2021-13-01.
  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return err({ kind: 'not-a-date' });
  }

  const dateNumber = toDateNumber(year, month, day);
  if (dateNumber < MIN_DATE_NUMBER) {
    return err({ kind: 'too-early', min: MIN_DATE });
  }

  const todayNumber = toDateNumber(
    today.getFullYear(),
    today.getMonth() + 1,
    today.getDate(),
  );
  if (dateNumber > todayNumber) {
    return err({ kind: 'in-future' });
  }

  return ok(parsed);
}

/**
 * Encode a calendar date as a comparable `YYYYMMDD` integer so date-only
 * comparisons ignore the time-of-day component of {@link Date} values.
 */
function toDateNumber(year: number, month: number, day: number): number {
  return year * 10_000 + month * 100 + day;
}

/**
 * Why a category selection was rejected. The Category field is a required
 * selection (Requirement 2.5), so the only failure is the absence of a valid
 * selection.
 *
 * Validates: Requirement 2.5
 */
export type CategoryError = { kind: 'required' };

/**
 * Why a source selection was rejected. The Source field is a required
 * selection (Requirement 2.6), so the only failure is the absence of a valid
 * selection.
 *
 * Validates: Requirement 2.6
 */
export type SourceError = { kind: 'required' };

/**
 * Raw, unvalidated values captured from the Expense_Entry form.
 *
 * `amount` and `description` are raw strings as typed by the user. `category`
 * and `source` are the raw selection values, which may be empty/`null` when no
 * option has been chosen or may hold an arbitrary string that is not a valid
 * enum member. `date` is the raw date input, `null` or empty when left blank
 * (which defaults to `today` — Requirement 2.7).
 *
 * See design "Domain Layer (pure functions)" — `validateExpenseForm`.
 */
export interface ExpenseFormInput {
  amount: string;
  category: string | null;
  source: string | null;
  date: string | null;
  description: string;
}

/**
 * Aggregated per-field validation errors for the Expense_Entry form. Each
 * field is present only when that field failed validation, so an all-valid
 * form produces no `FieldErrors` (the form resolves to a {@link Result} `ok`).
 *
 * Validates: Requirements 2.1, 2.5, 2.6
 */
export interface FieldErrors {
  amount?: AmountError;
  category?: CategoryError;
  source?: SourceError;
  date?: DateError;
  description?: DescError;
}

/** Type guard: is `value` one of the valid {@link Category} members? */
function isCategory(value: string | null): value is Category {
  return value !== null && (CATEGORIES as readonly string[]).includes(value);
}

/** Type guard: is `value` one of the valid {@link Source} members? */
function isSource(value: string | null): value is Source {
  return value !== null && (SOURCES as readonly string[]).includes(value);
}

/**
 * Validate a complete Expense_Entry form.
 *
 * Each field is validated with its dedicated validator: amount via
 * {@link validateAmount}, description via {@link validateDescription}, and date
 * via {@link validateDate} (an empty date defaults to `today`). Category and
 * Source are required selections — a missing/empty value, or any value that is
 * not a valid enum member, is rejected with a `required` error
 * (Requirements 2.5, 2.6).
 *
 * On success the assembled {@link ExpenseInput} is returned with the parsed
 * amount, the validated date, and the validated description. On any failure
 * *all* collected per-field errors are returned together as {@link FieldErrors}
 * so the UI can surface every problem at once and no expense is stored.
 *
 * `today` is taken as a parameter (rather than read from the system clock) so
 * the function stays pure and deterministic for testing.
 *
 * Validates: Requirements 2.1, 2.5, 2.6
 */
export function validateExpenseForm(
  form: ExpenseFormInput,
  today: Date,
): Result<ExpenseInput, FieldErrors> {
  const errors: FieldErrors = {};

  const amountResult = validateAmount(form.amount);
  if (!amountResult.ok) {
    errors.amount = amountResult.error;
  }

  if (!isCategory(form.category)) {
    errors.category = { kind: 'required' };
  }

  if (!isSource(form.source)) {
    errors.source = { kind: 'required' };
  }

  const dateResult = validateDate(form.date, today);
  if (!dateResult.ok) {
    errors.date = dateResult.error;
  }

  const descriptionResult = validateDescription(form.description);
  if (!descriptionResult.ok) {
    errors.description = descriptionResult.error;
  }

  if (Object.keys(errors).length > 0) {
    return err(errors);
  }

  // All validators succeeded, so these narrow safely. The category and source
  // guards above guarantee the raw values are valid enum members here.
  return ok({
    amount: (amountResult as { ok: true; value: number }).value,
    category: form.category as Category,
    source: form.source as Source,
    date: (dateResult as { ok: true; value: Date }).value,
    description: (descriptionResult as { ok: true; value: string }).value,
  });
}
