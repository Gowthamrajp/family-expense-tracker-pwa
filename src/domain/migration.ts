/**
 * Pure migration planning for moving legacy, top-level MVP expenses into the
 * first Family group (Req 10.1–10.5). See design "Migration model" and
 * "Property 13".
 *
 * This module is framework- and I/O-free: it computes an inspectable
 * {@link MigrationPlan} and performs no Firebase access. The data layer is
 * responsible for executing the plan (creating categories, then writing the
 * family-scoped expenses) and for resolving category references to real ids.
 *
 * --------------------------------------------------------------------------
 * categoryId contract for the produced plan
 *
 * Categories are matched and created by NORMALIZED NAME, and the ids of
 * to-be-created categories are not known until the data layer writes them.
 * To keep the plan pure and deterministic, every produced
 * `familyExpense.categoryId` holds the resolved category's DISPLAY NAME (not a
 * Firestore id):
 *
 *   - For a legacy category that matches an existing {@link FamilyCategory}
 *     (case-insensitively), `categoryId` is that existing category's `name`.
 *   - For a legacy category with no existing match, the distinct name is added
 *     to `categoriesToCreate` once (per normalized name, first-seen display
 *     string wins) and `categoryId` is that same display name.
 *
 * The data layer therefore: (1) creates every `categoriesToCreate` entry, (2)
 * builds a normalized-name -> id map over the family's categories (existing +
 * newly created), and (3) replaces each `familyExpense.categoryId` (a name)
 * with the corresponding real id before persisting. This matches the design
 * note: "the data layer assigns ids after creating categories".
 * --------------------------------------------------------------------------
 */

import { timestampToDate } from './expenseMapper';
import {
  type Category,
  type ExpenseInput,
  type FamilyCategory,
  type LegacyExpenseDocument,
  type MigrationPlan,
  type Source,
  SOURCES,
} from './types';

/**
 * Canonical form used for case-insensitive category-name comparison:
 * trim, collapse internal whitespace runs to a single space, and casefold.
 *
 * NOTE: This mirrors the `normalizeCategoryName` defined by the category
 * domain module (design "category.ts", Req 4.3/4.5). It is duplicated locally
 * so migration planning has no cross-task dependency; once `category.ts` is
 * available this should be imported from there to keep a single source of
 * truth.
 */
function normalizeCategoryName(raw: string): string {
  return raw.trim().replace(/\s+/g, ' ').toLowerCase();
}

/** Set of valid {@link Source} values for fast membership checks (Req 10.3). */
const VALID_SOURCES: ReadonlySet<string> = new Set<string>(SOURCES);

/**
 * Whether a legacy expense has already been migrated into the family.
 *
 * Used to keep {@link planMigration} idempotent: a legacy id present in
 * `migrated` produces no write, so re-running a partial/retried migration
 * never duplicates data (Req 10.1).
 */
export function isExpenseMigrated(
  legacyId: string,
  migrated: Set<string>,
): boolean {
  return migrated.has(legacyId);
}

/**
 * Plan the migration of legacy, top-level expenses into the first Family.
 *
 * Pure and deterministic: the output depends only on the inputs and input
 * order. For each legacy expense NOT already migrated, the plan resolves its
 * category string to an existing {@link FamilyCategory} by normalized name (or
 * schedules a new category to be created so every distinct category string
 * resolves), validates its source string against the {@link Source} enum, and
 * preserves amount/date/description/recordedBy/createdAt unchanged (Req 10.4).
 *
 * @param legacy - Legacy expense documents from the top-level collection.
 * @param existingCategories - Categories already present in the first family.
 * @param migrated - Legacy ids already migrated; defaults to an empty set.
 *
 * Validates: Requirements 10.1, 10.2, 10.3, 10.4, 10.5
 */
export function planMigration(
  legacy: LegacyExpenseDocument[],
  existingCategories: FamilyCategory[],
  migrated: Set<string> = new Set<string>(),
): MigrationPlan {
  // Index existing categories by normalized name; first occurrence wins so the
  // result is deterministic when callers pass duplicate names.
  const existingByNorm = new Map<string, FamilyCategory>();
  for (const category of existingCategories) {
    const norm = normalizeCategoryName(category.name);
    if (!existingByNorm.has(norm)) {
      existingByNorm.set(norm, category);
    }
  }

  const categoriesToCreate: MigrationPlan['categoriesToCreate'] = [];
  // Normalized name -> display name chosen for a to-be-created category.
  const createdByNorm = new Map<string, string>();
  const expenseWrites: MigrationPlan['expenseWrites'] = [];
  const failures: MigrationPlan['failures'] = [];

  for (const item of legacy) {
    // (d) Idempotence: skip anything already migrated — no write produced.
    if (isExpenseMigrated(item.id, migrated)) {
      continue;
    }

    // (c) Source must map to a known Source; otherwise record a failure and
    // leave the legacy expense untouched (Req 10.3, 10.5).
    if (!VALID_SOURCES.has(item.source)) {
      failures.push({
        legacyId: item.id,
        reason: `Unknown source "${item.source}"; expected one of: ${SOURCES.join(', ')}.`,
      });
      continue;
    }
    const source = item.source as Source;

    // (a)/(b) Resolve the category by normalized name, scheduling a new
    // category when none exists so every distinct string resolves (Req 10.2).
    const norm = normalizeCategoryName(item.category);
    let resolvedName: string;
    const existing = existingByNorm.get(norm);
    if (existing !== undefined) {
      resolvedName = existing.name;
    } else {
      const alreadyScheduled = createdByNorm.get(norm);
      if (alreadyScheduled !== undefined) {
        resolvedName = alreadyScheduled;
      } else {
        // First-seen raw string becomes the display name for this category.
        resolvedName = item.category;
        createdByNorm.set(norm, resolvedName);
        categoriesToCreate.push({ name: resolvedName });
      }
    }

    // Preserve original fields unchanged (Req 10.4). `category` retains the
    // legacy string (shim union cast); `categoryId` carries the resolved
    // display NAME per this module's contract (see file header).
    const familyExpense: ExpenseInput & { recordedBy: string; createdAt: Date } = {
      amount: item.amount,
      category: item.category as Category,
      categoryId: resolvedName,
      source,
      date: timestampToDate(item.date),
      description: item.description,
      recordedBy: item.recordedBy,
      createdAt: timestampToDate(item.createdAt),
    };

    expenseWrites.push({ legacyId: item.id, familyExpense });
  }

  return { categoriesToCreate, expenseWrites, failures };
}
