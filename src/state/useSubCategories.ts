/**
 * React hook exposing the active family's sub-categories with live updates and
 * add/rename/delete actions with validation feedback.
 *
 * Sub-categories refine a {@link FamilyCategory} for finer spending
 * classification. While a family is resolved, the hook subscribes via
 * {@link subCategoryRepository.subscribeToSubCategories}. `addSubCategory` and
 * `renameSubCategory` validate the name against the existing sub-categories of
 * the same parent (case/space-insensitive uniqueness) before any write.
 * Deletion is blocked when an expense references the sub-category, returning an
 * {@link InUseError} with the referencing count. `forCategory` filters the list
 * to a single parent, which the entry form uses to populate its select.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { subCategoryRepository } from '../data/subCategoryRepository';
import {
  validateNewSubCategory,
  type SubCategoryError,
} from '../domain/subCategory';
import {
  err,
  ok,
  type InUseError,
  type Result,
  type SubCategory,
} from '../domain/types';

/** Lifecycle status of the sub-category subscription. */
export type SubCategoriesStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useSubCategories}. */
export interface UseSubCategoriesResult {
  subCategories: SubCategory[];
  status: SubCategoriesStatus;
  /** Sub-categories belonging to the given parent category id. */
  forCategory(categoryId: string): SubCategory[];
  /** Validate and add a sub-category under `categoryId`. */
  addSubCategory(
    categoryId: string,
    name: string,
  ): Promise<Result<SubCategory, SubCategoryError>>;
  /** Validate and rename an existing sub-category. */
  renameSubCategory(
    subCategoryId: string,
    categoryId: string,
    name: string,
  ): Promise<Result<SubCategory, SubCategoryError>>;
  /** Delete a sub-category; blocked when referenced by an expense. */
  deleteSubCategory(
    subCategoryId: string,
  ): Promise<Result<void, InUseError>>;
}

/**
 * Subscribe to the family's sub-categories and expose management actions.
 *
 * @param familyId - Active family id, or `null` to stay idle.
 */
export function useSubCategories(
  familyId: string | null,
): UseSubCategoriesResult {
  const [subCategories, setSubCategories] = useState<SubCategory[]>([]);
  const [status, setStatus] = useState<SubCategoriesStatus>('loading');

  // Latest list ref so validators run against current data without recreating
  // callbacks on every snapshot.
  const ref = useRef<SubCategory[]>(subCategories);
  ref.current = subCategories;

  useEffect(() => {
    if (familyId === null) {
      setStatus('loading');
      setSubCategories([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = subCategoryRepository.subscribeToSubCategories(
      familyId,
      (incoming) => {
        setSubCategories(incoming);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsubscribe;
  }, [familyId]);

  const forCategory = useCallback(
    (categoryId: string): SubCategory[] =>
      subCategories.filter((sub) => sub.categoryId === categoryId),
    [subCategories],
  );

  const addSubCategory = useCallback(
    async (
      categoryId: string,
      name: string,
    ): Promise<Result<SubCategory, SubCategoryError>> => {
      const validation = validateNewSubCategory(name, categoryId, ref.current);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null) {
        return err({ kind: 'required' });
      }
      const id = await subCategoryRepository.addSubCategory(
        familyId,
        categoryId,
        validation.value,
      );
      return ok({ id, categoryId, name: validation.value });
    },
    [familyId],
  );

  const renameSubCategory = useCallback(
    async (
      subCategoryId: string,
      categoryId: string,
      name: string,
    ): Promise<Result<SubCategory, SubCategoryError>> => {
      const validation = validateNewSubCategory(
        name,
        categoryId,
        ref.current,
        subCategoryId,
      );
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null) {
        return err({ kind: 'required' });
      }
      await subCategoryRepository.renameSubCategory(
        familyId,
        subCategoryId,
        validation.value,
      );
      return ok({ id: subCategoryId, categoryId, name: validation.value });
    },
    [familyId],
  );

  const deleteSubCategory = useCallback(
    async (subCategoryId: string): Promise<Result<void, InUseError>> => {
      if (familyId === null) {
        return ok(undefined);
      }
      return subCategoryRepository.deleteSubCategory(familyId, subCategoryId);
    },
    [familyId],
  );

  return {
    subCategories,
    status,
    forCategory,
    addSubCategory,
    renameSubCategory,
    deleteSubCategory,
  };
}
