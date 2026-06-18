/**
 * React hook exposing the active family's scoped (category / sub-category)
 * budgets with live updates and validated set/clear actions.
 *
 * While a family is resolved, the hook subscribes to the `budgets`
 * subcollection via {@link scopedBudgetRepository.subscribeToScopedBudgets}.
 * It begins `loading`, transitions to `ready` on the first snapshot, and
 * reports `error` on listener failure. When `familyId` is `null` the hook stays
 * idle and the set actions resolve to an error without writing.
 *
 * Set actions validate the raw value for the chosen mode via
 * {@link validateBudgetValue} before writing, so an invalid value is never
 * persisted. Lookups (`forCategory` / `forSubCategory`) resolve a scope to its
 * budget for the UI.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { scopedBudgetRepository } from '../data/scopedBudgetRepository';
import {
  categoryBudgetDocId,
  subCategoryBudgetDocId,
  validateBudgetValue,
  type BudgetError,
} from '../domain/budget';
import type {
  BudgetMode,
  FamilyMember,
  Result,
  ScopedBudget,
} from '../domain/types';
import { err, ok } from '../domain/types';

/** Lifecycle status of the scoped-budgets subscription. */
export type ScopedBudgetsStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useScopedBudgets}. */
export interface UseScopedBudgetsResult {
  /** All scoped budgets for the family. */
  budgets: ScopedBudget[];
  status: ScopedBudgetsStatus;
  /** The budget targeting a category, or null when none is set. */
  forCategory(categoryId: string): ScopedBudget | null;
  /** The budget targeting a sub-category, or null when none is set. */
  forSubCategory(subCategoryId: string): ScopedBudget | null;
  /** Validate and persist a category budget. */
  setCategoryBudget(
    categoryId: string,
    mode: BudgetMode,
    rawValue: string,
  ): Promise<Result<void, BudgetError>>;
  /** Validate and persist a sub-category budget. */
  setSubCategoryBudget(
    subCategoryId: string,
    parentCategoryId: string,
    mode: BudgetMode,
    rawValue: string,
  ): Promise<Result<void, BudgetError>>;
  /** Remove the category budget for `categoryId`. */
  clearCategoryBudget(categoryId: string): Promise<void>;
  /** Remove the sub-category budget for `subCategoryId`. */
  clearSubCategoryBudget(subCategoryId: string): Promise<void>;
}

/**
 * Subscribe to the live, family-scoped category/sub-category budgets and expose
 * set/clear and per-scope lookups.
 *
 * @param familyId The active family's id, or `null` to stay idle.
 * @param member The current member, attributed as the budget's last editor.
 */
export function useScopedBudgets(
  familyId: string | null,
  member: FamilyMember | null,
): UseScopedBudgetsResult {
  const [budgets, setBudgets] = useState<ScopedBudget[]>([]);
  const [status, setStatus] = useState<ScopedBudgetsStatus>('loading');

  useEffect(() => {
    if (familyId === null) {
      setStatus('loading');
      setBudgets([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = scopedBudgetRepository.subscribeToScopedBudgets(
      familyId,
      (incoming) => {
        setBudgets(incoming);
        setStatus('ready');
      },
      () => {
        setStatus('error');
      },
    );
    return unsubscribe;
  }, [familyId]);

  // Index by document id for O(1) lookups.
  const byId = useMemo(() => {
    const map = new Map<string, ScopedBudget>();
    for (const b of budgets) {
      map.set(b.id, b);
    }
    return map;
  }, [budgets]);

  const forCategory = useCallback(
    (categoryId: string): ScopedBudget | null =>
      byId.get(categoryBudgetDocId(categoryId)) ?? null,
    [byId],
  );

  const forSubCategory = useCallback(
    (subCategoryId: string): ScopedBudget | null =>
      byId.get(subCategoryBudgetDocId(subCategoryId)) ?? null,
    [byId],
  );

  const setCategoryBudget = useCallback(
    async (
      categoryId: string,
      mode: BudgetMode,
      rawValue: string,
    ): Promise<Result<void, BudgetError>> => {
      const validation = validateBudgetValue(mode, rawValue);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null || member === null) {
        return err({ kind: 'required' });
      }
      await scopedBudgetRepository.setCategoryBudget(familyId, {
        categoryId,
        mode,
        ...(mode === 'amount'
          ? { amount: validation.value }
          : { percent: validation.value }),
        updatedBy: member.uid,
      });
      return ok(undefined);
    },
    [familyId, member],
  );

  const setSubCategoryBudget = useCallback(
    async (
      subCategoryId: string,
      parentCategoryId: string,
      mode: BudgetMode,
      rawValue: string,
    ): Promise<Result<void, BudgetError>> => {
      const validation = validateBudgetValue(mode, rawValue);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null || member === null) {
        return err({ kind: 'required' });
      }
      await scopedBudgetRepository.setSubCategoryBudget(familyId, {
        subCategoryId,
        parentCategoryId,
        mode,
        ...(mode === 'amount'
          ? { amount: validation.value }
          : { percent: validation.value }),
        updatedBy: member.uid,
      });
      return ok(undefined);
    },
    [familyId, member],
  );

  const clearCategoryBudget = useCallback(
    async (categoryId: string): Promise<void> => {
      if (familyId === null) {
        return;
      }
      await scopedBudgetRepository.clearScopedBudget(
        familyId,
        categoryBudgetDocId(categoryId),
      );
    },
    [familyId],
  );

  const clearSubCategoryBudget = useCallback(
    async (subCategoryId: string): Promise<void> => {
      if (familyId === null) {
        return;
      }
      await scopedBudgetRepository.clearScopedBudget(
        familyId,
        subCategoryBudgetDocId(subCategoryId),
      );
    },
    [familyId],
  );

  return {
    budgets,
    status,
    forCategory,
    forSubCategory,
    setCategoryBudget,
    setSubCategoryBudget,
    clearCategoryBudget,
    clearSubCategoryBudget,
  };
}
