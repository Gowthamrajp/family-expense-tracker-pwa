/**
 * Family-scoped sub-category pure logic.
 *
 * Sub-categories refine a {@link FamilyCategory} (e.g. Food → Groceries) for
 * finer spending classification. A sub-category name must be non-empty and
 * unique within its parent category (case- and whitespace-insensitive). This
 * module holds the framework- and I/O-free validation so it can be unit-tested
 * independent of Firebase and the DOM. It reuses {@link normalizeCategoryName}
 * for the canonical comparison form so categories and sub-categories normalize
 * identically.
 */

import { normalizeCategoryName } from './category';
import type { Result, SubCategory } from './types';
import { err, ok } from './types';

/**
 * Reasons a proposed sub-category can be rejected. Discriminated by `kind`.
 *
 * - `required`: the name is empty or whitespace-only.
 * - `duplicate`: the normalized name matches an existing sub-category under the
 *   same parent category.
 */
export type SubCategoryError =
  | { kind: 'required' }
  | { kind: 'duplicate' };

/**
 * Validate a proposed sub-category name against the existing sub-categories of
 * the same parent category.
 *
 * - Rejects with `{ kind: 'required' }` when the normalized name is empty.
 * - Rejects with `{ kind: 'duplicate' }` when the normalized name equals that
 *   of an existing sub-category under `categoryId` (case/space-insensitive).
 *   When `excludeId` is provided, that sub-category is ignored in the
 *   duplicate check so renaming an item to its own (re-cased) name is allowed.
 * - Otherwise succeeds with the trimmed display name (original casing/spacing
 *   preserved).
 *
 * @param raw raw, user-entered sub-category name
 * @param categoryId parent category id the sub-category belongs to
 * @param existing the family's current sub-categories (any parent)
 * @param excludeId optional id to exclude from the duplicate check (for rename)
 */
export function validateNewSubCategory(
  raw: string,
  categoryId: string,
  existing: SubCategory[],
  excludeId?: string,
): Result<string, SubCategoryError> {
  const normalized = normalizeCategoryName(raw);
  if (normalized.length === 0) {
    return err({ kind: 'required' });
  }

  const isDuplicate = existing.some(
    (sub) =>
      sub.categoryId === categoryId &&
      sub.id !== excludeId &&
      normalizeCategoryName(sub.name) === normalized,
  );
  if (isDuplicate) {
    return err({ kind: 'duplicate' });
  }

  return ok(raw.trim());
}
