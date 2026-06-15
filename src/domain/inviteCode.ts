/**
 * Invite-code pure logic for the Family Expense Tracker.
 *
 * Invite codes identify a {@link import('./types').Family} for the join-by-code
 * flow (Req 2.2, 2.3, 2.4). Codes use an unambiguous uppercase base32 alphabet
 * that excludes the visually ambiguous characters `0`, `O`, `1`, and `I`, so a
 * human can read a code aloud or copy it without confusion.
 *
 * This module is pure (no Firebase, no DOM): generation takes an injected
 * randomness source so it is deterministic and testable.
 *
 * Design invariant (Property 9): for any sequence produced by the injected
 * randomness source, {@link generateInviteCode} produces a code whose length is
 * within the documented bound and whose characters are all drawn from
 * {@link INVITE_CODE_ALPHABET}; and for any such code, {@link isWellFormedInviteCode}
 * returns `true` and {@link normalizeInviteCode} returns it unchanged.
 */

/**
 * The unambiguous uppercase base32 alphabet used for invite codes.
 *
 * It contains the uppercase letters `A`–`Z` excluding `O` and `I`, plus the
 * digits `2`–`9` (excluding the ambiguous `0` and `1`). That is 24 letters + 8
 * digits = 32 characters.
 */
export const INVITE_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** Inclusive lower bound on invite-code length (Req 2.2, 2.4). */
export const INVITE_CODE_MIN_LENGTH = 6;

/** Inclusive upper bound on invite-code length (Req 2.2, 2.4). */
export const INVITE_CODE_MAX_LENGTH = 8;

/**
 * Fixed length used by {@link generateInviteCode}. Held constant within the
 * documented `[INVITE_CODE_MIN_LENGTH, INVITE_CODE_MAX_LENGTH]` bound so that
 * every generated code is well-formed.
 */
export const INVITE_CODE_LENGTH = 8;

/**
 * Generate an invite code from an injected randomness source.
 *
 * Each character is chosen from {@link INVITE_CODE_ALPHABET} using a value from
 * `rng`, which must return a number in the half-open interval `[0, 1)` (the
 * same contract as `Math.random`). The output is always already-normalized:
 * uppercase and composed only of alphabet characters, with a fixed length of
 * {@link INVITE_CODE_LENGTH}.
 *
 * @param rng a randomness source returning a number in `[0, 1)`
 * @returns a well-formed, normalized invite code
 */
export function generateInviteCode(rng: () => number): string {
  const alphabet = INVITE_CODE_ALPHABET;
  let code = '';
  for (let i = 0; i < INVITE_CODE_LENGTH; i++) {
    const index = clampIndex(rng(), alphabet.length);
    code += alphabet[index];
  }
  return code;
}

/**
 * Test whether a string is a well-formed invite code.
 *
 * A code is well-formed iff its length is within the documented bound
 * (`[INVITE_CODE_MIN_LENGTH, INVITE_CODE_MAX_LENGTH]`, inclusive) and every
 * character belongs to {@link INVITE_CODE_ALPHABET}. The check is exact: it does
 * not trim or uppercase the input. Use {@link normalizeInviteCode} first to
 * normalize user-typed codes before validating or looking them up.
 *
 * @param code the candidate code
 * @returns `true` iff the code is well-formed
 */
export function isWellFormedInviteCode(code: string): boolean {
  if (code.length < INVITE_CODE_MIN_LENGTH || code.length > INVITE_CODE_MAX_LENGTH) {
    return false;
  }
  for (const char of code) {
    if (!INVITE_CODE_ALPHABET.includes(char)) {
      return false;
    }
  }
  return true;
}

/**
 * Normalize a raw, user-typed invite code for lookup.
 *
 * Trims surrounding whitespace, removes interior spaces and hyphens (which
 * users may insert for readability), and uppercases the result so codes match
 * the stored, generated form regardless of how they were typed.
 *
 * @param raw the raw user input
 * @returns the normalized code
 */
export function normalizeInviteCode(raw: string): string {
  return raw.replace(/[\s-]+/g, '').toUpperCase();
}

/**
 * Map a randomness value in `[0, 1)` to a valid array index in `[0, length)`.
 *
 * Defends against out-of-contract `rng` values (negative, `>= 1`, or `NaN`) so
 * generation never produces an undefined character.
 */
function clampIndex(value: number, length: number): number {
  if (!Number.isFinite(value) || value <= 0) {
    return 0;
  }
  if (value >= 1) {
    return length - 1;
  }
  return Math.floor(value * length);
}
