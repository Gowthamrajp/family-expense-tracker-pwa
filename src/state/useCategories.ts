/**
 * React hook that exposes the active family's category list with live updates
 * and an add operation with client-side validation feedback.
 *
 * While a family is resolved, the hook subscribes to the Firestore real-time
 * listener via {@link categoryRepository.subscribeToCategories}, scoped to the
 * family id. It begins in a `loading` state, transitions to `ready` on the
 * first snapshot, and surfaces an `error` status on listener failure while
 * retaining any previously displayed data (Req 4.2, 4.6).
 *
 * `addCategory` validates the proposed name against the currently known
 * categories via {@link validateNewCategory} before writing: empty/whitespace
 * names are rejected (Req 4.4) and duplicates are rejected case- and
 * whitespace-insensitively (Req 4.5). Only valid names are persisted via
 * {@link categoryRepository.addCategory} (Req 4.3); the live subscription then
 * delivers the new category back into `categories`.
 *
 * Coupling to the auth/family layers is intentionally loose, mirroring
 * {@link useExpenses}: callers pass `familyId` rather than this hook reaching
 * into a context, so it can be used and tested independently. When `familyId`
 * is `null` the hook stays idle (no subscription), reports `loading`, and
 * `addCategory` resolves to an error without writing.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { categoryRepository } from '../data/categoryRepository';
import {
  validateNewCategory,
  type CategoryError,
} from '../domain/category';
import type { FamilyCategory, InUseError, Result } from '../domain/types';
import { err, ok } from '../domain/types';

/** Lifecycle status of the categories subscription. */
export type CategoriesStatus = 'loading' | 'ready' | 'error';

/**
 * Result returned by {@link useCategories}. Mirrors the design's
 * `UseCategoriesResult` contract (`FamilyCategory` is the shim name for the
 * design's canonical `Category` object).
 */
export interface UseCategoriesResult {
  /** Current categories, ordered by name ascending (Req 4.6). */
  categories: FamilyCategory[];
  /** Subscription status: loading, ready, or error. */
  status: CategoriesStatus;
  /**
   * Validate and add a new category. Returns an `ok` Result with the created
   * {@link FamilyCategory} on success, or an `err` Result carrying a
   * {@link CategoryError} when the name is empty (Req 4.4), a duplicate
   * (Req 4.5), or no family is active. Invalid names are never written.
   */
  addCategory(name: string): Promise<Result<FamilyCategory, CategoryError>>;
  /**
   * Rename an existing category. Validates the new name against the other
   * categories (case/space-insensitive uniqueness, excluding itself). On
   * success the live subscription reflects the new name; since grouping is by
   * id, all referencing expenses update automatically.
   */
  renameCategory(
    categoryId: string,
    name: string,
  ): Promise<Result<FamilyCategory, CategoryError>>;
  /**
   * Delete a category. Delegates to
   * {@link categoryRepository.deleteCategory}, which removes the category only
   * when no Expense in the family references it (Req 4.8). When one or more
   * expenses still reference it, resolves to an `err` Result carrying an
   * {@link InUseError} with the referencing count and performs no delete
   * (Req 4.9). The live subscription removes the item from `categories` on
   * success (Req 4.7).
   */
  deleteCategory(categoryId: string): Promise<Result<void, InUseError>>;
}

/**
 * Subscribe to the live, family-scoped category list and expose add.
 *
 * @param familyId - The active family's id. When `null`, the hook does not
 *   subscribe and reports `loading` with no data, and `addCategory` returns an
 *   error without writing.
 * @returns The current categories, subscription status, and `addCategory`.
 *
 * Validates: Requirements 4.2, 4.3, 4.4, 4.5, 4.6
 */
export function useCategories(familyId: string | null): UseCategoriesResult {
  const [categories, setCategories] = useState<FamilyCategory[]>([]);
  const [status, setStatus] = useState<CategoriesStatus>('loading');

  // Keep a ref to the latest categories so addCategory validates against the
  // current list without being re-created on every snapshot.
  const categoriesRef = useRef<FamilyCategory[]>(categories);
  categoriesRef.current = categories;

  useEffect(() => {
    if (familyId === null) {
      // No resolved family: do not subscribe. Reset to the initial loading
      // state so stale data is not surfaced once the family changes/clears.
      setStatus('loading');
      setCategories([]);
      return;
    }

    // Each (re)subscription starts in the loading state.
    setStatus('loading');

    const unsubscribe = categoryRepository.subscribeToCategories(
      familyId,
      (incoming) => {
        setCategories(incoming);
        setStatus('ready');
      },
      () => {
        // Retain previously displayed data on error (Req 4.7); only the status
        // changes so the UI can show an error message.
        setStatus('error');
      },
    );

    // Clean up on unmount and before re-subscribing (familyId change).
    return unsubscribe;
  }, [familyId]);

  const addCategory = useCallback(
    async (
      name: string,
    ): Promise<Result<FamilyCategory, CategoryError>> => {
      // Validate against the currently known categories before writing
      // (Req 4.4 empty, 4.5 duplicate). Invalid input is never persisted.
      const validation = validateNewCategory(name, categoriesRef.current);
      if (!validation.ok) {
        return err(validation.error);
      }

      if (familyId === null) {
        // No active family to write to; treat as a not-allowed add. Surface a
        // `required` error rather than throwing so callers handle it uniformly.
        return err({ kind: 'required' });
      }

      // Persist the validated display name (Req 4.3). The live subscription
      // delivers the new category into `categories`.
      const id = await categoryRepository.addCategory(
        familyId,
        validation.value,
      );
      return ok({ id, name: validation.value });
    },
    [familyId],
  );

  const deleteCategory = useCallback(
    async (categoryId: string): Promise<Result<void, InUseError>> => {
      if (familyId === null) {
        // No active family: nothing is displayed to delete. Treat as a no-op
        // success so callers do not need to special-case the idle state.
        return ok(undefined);
      }

      // Delegate to the repository, which counts referencing expenses and
      // blocks the delete when the category is still in use (Req 4.8, 4.9).
      // On success the live subscription removes the item from `categories`
      // (Req 4.7).
      return categoryRepository.deleteCategory(familyId, categoryId);
    },
    [familyId],
  );

  const renameCategory = useCallback(
    async (
      categoryId: string,
      name: string,
    ): Promise<Result<FamilyCategory, CategoryError>> => {
      // Validate against the other categories (exclude this one so re-casing
      // its own name is allowed).
      const validation = validateNewCategory(
        name,
        categoriesRef.current,
        categoryId,
      );
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null) {
        return err({ kind: 'required' });
      }
      await categoryRepository.renameCategory(
        familyId,
        categoryId,
        validation.value,
      );
      return ok({ id: categoryId, name: validation.value });
    },
    [familyId],
  );

  return { categories, status, addCategory, deleteCategory, renameCategory };
}
