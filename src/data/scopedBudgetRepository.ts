/**
 * Firestore adapter for a family's scoped (category / sub-category) budgets.
 *
 * Each scoped budget is a document under `families/{familyId}/budgets/{id}`
 * where the id encodes the scope (`cat_{categoryId}` / `sub_{subCategoryId}`)
 * so a given category or sub-category has at most one budget. The family-wide
 * ("global") budget remains the separate `settings/budget` document handled by
 * {@link budgetRepository}.
 *
 * This module is one of the few places that imports the Firestore SDK directly,
 * keeping SDK coupling out of the domain and state layers.
 */
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  collection,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import {
  categoryBudgetDocId,
  subCategoryBudgetDocId,
} from '../domain/budget';
import type {
  BudgetMode,
  ScopedBudget,
  ScopedBudgetDocument,
} from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const BUDGETS_COLLECTION = 'budgets';

/** Build a reference to the `families/{familyId}/budgets` subcollection. */
function budgetsCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, BUDGETS_COLLECTION);
}

/** Build a reference to a single scoped-budget document by its id. */
function scopedBudgetDocRef(familyId: string, docId: string) {
  return doc(firestore, FAMILIES_COLLECTION, familyId, BUDGETS_COLLECTION, docId);
}

/** Map a scoped-budget document snapshot to the domain {@link ScopedBudget}. */
function readScopedBudget(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): ScopedBudget {
  const data = snapshot.data() as ScopedBudgetDocument;
  const updatedAt =
    data.updatedAt instanceof Timestamp ? data.updatedAt.toDate() : new Date();
  const budget: ScopedBudget = {
    id: snapshot.id,
    scopeType: data.scopeType,
    scopeId: data.scopeId,
    mode: data.mode,
    updatedBy: data.updatedBy,
    updatedAt,
  };
  if (data.parentCategoryId !== undefined) {
    budget.parentCategoryId = data.parentCategoryId;
  }
  if (data.amount !== undefined) {
    budget.amount = data.amount;
  }
  if (data.percent !== undefined) {
    budget.percent = data.percent;
  }
  return budget;
}

/** Fields persisted when a member sets a category budget. */
export interface SetCategoryBudgetInput {
  categoryId: string;
  mode: BudgetMode;
  amount?: number;
  percent?: number;
  updatedBy: string;
}

/** Fields persisted when a member sets a sub-category budget. */
export interface SetSubCategoryBudgetInput {
  subCategoryId: string;
  parentCategoryId: string;
  mode: BudgetMode;
  amount?: number;
  percent?: number;
  updatedBy: string;
}

/** Data-layer contract for persisting and observing scoped budgets. */
export interface ScopedBudgetRepository {
  /**
   * Subscribe to all of the family's scoped budgets. `onData` is invoked with
   * the full list on every snapshot. Returns an unsubscribe function.
   */
  subscribeToScopedBudgets(
    familyId: string,
    onData: (budgets: ScopedBudget[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Create or replace a category-scoped budget. */
  setCategoryBudget(familyId: string, input: SetCategoryBudgetInput): Promise<void>;

  /** Create or replace a sub-category-scoped budget. */
  setSubCategoryBudget(
    familyId: string,
    input: SetSubCategoryBudgetInput,
  ): Promise<void>;

  /** Remove a scoped budget by its document id. */
  clearScopedBudget(familyId: string, docId: string): Promise<void>;
}

/** Build the persisted document body for a scoped budget write. */
function buildDocData(
  scopeType: ScopedBudget['scopeType'],
  scopeId: string,
  mode: BudgetMode,
  amount: number | undefined,
  percent: number | undefined,
  updatedBy: string,
  parentCategoryId?: string,
): Record<string, unknown> {
  const docData: Record<string, unknown> = {
    scopeType,
    scopeId,
    mode,
    updatedBy,
    updatedAt: serverTimestamp(),
  };
  if (parentCategoryId !== undefined) {
    docData.parentCategoryId = parentCategoryId;
  }
  // Write only the field relevant to the chosen mode so a stale amount/percent
  // never lingers when the scope switches modes.
  if (mode === 'amount') {
    docData.amount = amount;
  } else {
    docData.percent = percent;
  }
  return docData;
}

/** Live {@link ScopedBudgetRepository} backed by the Firestore instance. */
export const scopedBudgetRepository: ScopedBudgetRepository = {
  subscribeToScopedBudgets(
    familyId: string,
    onData: (budgets: ScopedBudget[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      budgetsCollection(familyId),
      (snapshot) => {
        onData(snapshot.docs.map(readScopedBudget));
      },
      (error) => onError(error),
    );
  },

  async setCategoryBudget(
    familyId: string,
    input: SetCategoryBudgetInput,
  ): Promise<void> {
    const docData = buildDocData(
      'category',
      input.categoryId,
      input.mode,
      input.amount,
      input.percent,
      input.updatedBy,
    );
    await setDoc(
      scopedBudgetDocRef(familyId, categoryBudgetDocId(input.categoryId)),
      docData,
    );
  },

  async setSubCategoryBudget(
    familyId: string,
    input: SetSubCategoryBudgetInput,
  ): Promise<void> {
    const docData = buildDocData(
      'subCategory',
      input.subCategoryId,
      input.mode,
      input.amount,
      input.percent,
      input.updatedBy,
      input.parentCategoryId,
    );
    await setDoc(
      scopedBudgetDocRef(familyId, subCategoryBudgetDocId(input.subCategoryId)),
      docData,
    );
  },

  async clearScopedBudget(familyId: string, docId: string): Promise<void> {
    await deleteDoc(scopedBudgetDocRef(familyId, docId));
  },
};
