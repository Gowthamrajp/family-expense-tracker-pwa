/**
 * Pure validation functions for payment sub-sources.
 *
 * A sub-source is an optional, family-scoped refinement of a {@link Source}
 * that stores only a nickname and an optional last-4-digits identifier — never
 * a full card number (Req 5.6, 9.5). These validators take raw form input and
 * return a {@link Result} carrying either the validated value or a per-field
 * error. The error types are discriminated unions (by `kind`) for consistency
 * with `validation.ts`.
 */

import {
  type Result,
  type SubSourceInput,
  type SubSourceFormInput,
  ok,
  err,
} from './types';

/** Required number of digits in a last-4 identifier when one is present. */
export const LAST4_LENGTH = 4;

/** Matches exactly four ASCII digits (`0`–`9`) with no surrounding characters. */
const LAST4_PATTERN = /^[0-9]{4}$/;

/**
 * Why a last-4 input was rejected. Discriminated by `kind` so the UI can render
 * an appropriate message ("must be exactly 4 digits", Req 5.5).
 *
 * Validates: Requirements 5.4, 5.5
 */
export type Last4Error = { kind: 'invalid-last4'; length: number };

/**
 * Why a sub-source input was rejected. Discriminated by `kind`; `nickname`
 * absence and an invalid `last4` are surfaced separately.
 *
 * Validates: Requirements 5.2, 5.3, 5.6
 */
export type SubSourceError =
  | { kind: 'nickname-required' }
  | { kind: 'invalid-last4'; length: number };

/**
 * Validate a raw last-4 identifier.
 *
 * An absent input — `null` or the empty string — is accepted as "no
 * identifier" and resolves to `ok(null)` (Req 5.4: the last-4 is optional). A
 * value of exactly four ASCII digits (`0`–`9`) resolves to `ok` of that exact
 * string. Every other input — wrong length, non-digit characters, surrounding
 * whitespace (e.g. `" 1234 "`), or non-ASCII digits — is rejected with a
 * {@link Last4Error} (Req 5.5). The value is never trimmed into validity.
 *
 * Validates: Requirements 5.4, 5.5
 */
export function validateLast4(
  raw: string | null,
): Result<string | null, Last4Error> {
  if (raw === null || raw === '') {
    return ok(null);
  }

  if (!LAST4_PATTERN.test(raw)) {
    return err({ kind: 'invalid-last4', length: raw.length });
  }

  return ok(raw);
}

/**
 * Validate a sub-source form input.
 *
 * Succeeds if and only if the nickname is non-empty after trimming (else
 * `nickname-required`, Req 5.3) and the optional last-4 passes
 * {@link validateLast4} (Req 5.4, 5.5). On success the produced
 * {@link SubSourceInput} contains ONLY `source`, the trimmed `nickname`, and —
 * when present — a `last4` of exactly four digits. No other field is ever
 * included and a full card number is never stored (Req 5.6, 9.5).
 *
 * Validates: Requirements 5.2, 5.3, 5.6
 */
export function validateSubSource(
  input: SubSourceFormInput,
): Result<SubSourceInput, SubSourceError> {
  const nickname = input.nickname.trim();
  if (nickname === '') {
    return err({ kind: 'nickname-required' });
  }

  const last4Result = validateLast4(input.last4);
  if (!last4Result.ok) {
    return err(last4Result.error);
  }

  // Build the output explicitly so only the allowed fields are ever present;
  // `last4` is included only when an identifier was provided.
  const validated: SubSourceInput =
    last4Result.value === null
      ? { source: input.source, nickname }
      : { source: input.source, nickname, last4: last4Result.value };

  return ok(validated);
}
