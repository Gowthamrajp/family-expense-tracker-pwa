/**
 * Family-scoped category pure logic for the Family Expense Tracker.
 *
 * Categories are editable, family-scoped data (not a fixed enum). This module
 * holds the framework- and I/O-free rules for normalizing category names and
 * validating proposed new categories against the ones a family already has, so
 * the logic can be unit- and property-tested independent of Firebase and the DOM.
 *
 * See design "Domain Layer" (`category.ts`) and Property 12.
 */

import type { FamilyCategory, Result } from './types';
import { err, ok } from './types';

/**
 * Canonical form of a category name used for uniqueness comparison.
 *
 * The normalization (Req 4.3, 4.5):
 * 1. trims leading/trailing whitespace,
 * 2. collapses any run of internal whitespace to a single space, and
 * 3. case-folds via {@link String.prototype.toLowerCase} so comparison is
 *    case-insensitive.
 *
 * This form is used ONLY for uniqueness/emptiness checks; the original casing
 * and spacing are preserved for display (see {@link validateNewCategory}).
 *
 * @param raw the raw, user-entered category name
 * @returns the normalized comparison key (may be empty)
 */
export function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/**
 * Reasons a proposed new category can be rejected. Discriminated by `kind`.
 *
 * - `required`: the name is empty or whitespace-only (Req 4.4).
 * - `duplicate`: the normalized name matches an existing category (Req 4.5).
 */
export type CategoryError =
  | { kind: 'required' }
  | { kind: 'duplicate' };

/**
 * Validate a proposed new category name against a family's existing categories.
 *
 * Behavior (Req 4.4, 4.5; Property 12):
 * - Rejects with `{ kind: 'required' }` when the normalized name is empty
 *   (empty or whitespace-only input).
 * - Rejects with `{ kind: 'duplicate' }` when the normalized name equals the
 *   normalized name of any existing category (case-insensitive, whitespace-
 *   insensitive).
 * - Otherwise succeeds with the trimmed display name, preserving the original
 *   casing and internal spacing. Uniqueness is judged by the normalized form.
 *
 * @param raw the raw, user-entered category name
 * @param existing the family's current categories
 * @returns a {@link Result} with the display name on success or a
 *   {@link CategoryError} on rejection
 */
export function validateNewCategory(
  raw: string,
  existing: FamilyCategory[],
  excludeId?: string,
): Result<string, CategoryError> {
  const normalized = normalizeCategoryName(raw);
  if (normalized.length === 0) {
    return err({ kind: 'required' });
  }

  const isDuplicate = existing.some(
    (category) =>
      category.id !== excludeId &&
      normalizeCategoryName(category.name) === normalized,
  );
  if (isDuplicate) {
    return err({ kind: 'duplicate' });
  }

  return ok(raw.trim());
}

/**
 * Seed set of editable category display names created as data when a family is
 * created (Req 4.1). Family members can add to or build on these afterward.
 */
export const DEFAULT_CATEGORY_SET: readonly string[] = [
  'Groceries',
  'Utilities',
  'Transport',
  'Dining',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Other',
] as const;
