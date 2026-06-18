/**
 * Firestore adapter for a family's `categories` subcollection.
 *
 * Categories are family-scoped, editable data stored under
 * `families/{familyId}/categories/{categoryId}` as `{ name }` documents
 * (see design "Firestore representation" and {@link CategoryDocument}). This
 * module is one of the few places that imports the Firestore SDK directly,
 * keeping SDK coupling out of the domain and state layers.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { DEFAULT_CATEGORY_SET } from '../domain/category';
import type {
  CategoryDocument,
  FamilyCategory,
  InUseError,
  Result,
} from '../domain/types';
import { err, ok } from '../domain/types';
import { firestore } from './firebase';

/** Name of the top-level families collection. */
const FAMILIES_COLLECTION = 'families';

/** Name of the per-family categories subcollection. */
const CATEGORIES_COLLECTION = 'categories';

/** Name of the per-family expenses subcollection (used for in-use counting). */
const EXPENSES_COLLECTION = 'expenses';

/**
 * Data-layer contract for persisting and observing a family's categories.
 * Mirrors the design's `CategoryRepository` interface.
 */
export interface CategoryRepository {
  /**
   * Subscribe to the family's categories ordered by name ascending. `onData`
   * is invoked with the full mapped list on every snapshot; `onError` receives
   * listener errors. Returns an unsubscribe function.
   *
   * Validates: Requirements 4.2, 4.6
   */
  subscribeToCategories(
    familyId: string,
    onData: (categories: FamilyCategory[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /**
   * Persist a new category `{ name }` under the family. Assumes the caller has
   * already validated the name via `validateNewCategory`; the repository only
   * writes. Resolves with the new document id.
   *
   * Validates: Requirements 4.3
   */
  addCategory(familyId: string, name: string): Promise<string>;

  /**
   * Rename an existing category (display name only). The id is unchanged, so
   * all referencing expenses keep their `categoryId` and grouping is unaffected
   * — the new name simply appears everywhere the id resolves.
   */
  renameCategory(familyId: string, categoryId: string, name: string): Promise<void>;

  /**
   * Seed the family's categories with the {@link DEFAULT_CATEGORY_SET}, writing
   * one document per default name in a single batch. Used during family
   * creation.
   *
   * Validates: Requirements 4.1
   */
  seedDefaults(familyId: string): Promise<void>;

  /**
   * Delete a category only when no Expense in the family references it.
   *
   * First counts the referencing expenses by querying the family's `expenses`
   * subcollection where `categoryId == categoryId` (see design "In-use
   * reference counting"). When the count is greater than zero, returns
   * `err({ kind: 'in-use', count })` and performs NO delete (Req 4.9). When the
   * count is zero, deletes the category document and returns `ok(undefined)`
   * (Req 4.8).
   *
   * Validates: Requirements 4.7, 4.8, 4.9
   */
  deleteCategory(
    familyId: string,
    categoryId: string,
  ): Promise<Result<void, InUseError>>;
}

/** Build a reference to the `families/{familyId}/categories` subcollection. */
function categoriesCollection(familyId: string) {
  return collection(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    CATEGORIES_COLLECTION,
  );
}

/** Build a reference to the `families/{familyId}/expenses` subcollection. */
function expensesCollection(familyId: string) {
  return collection(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    EXPENSES_COLLECTION,
  );
}

/**
 * Count the expenses in the family that reference `categoryId`.
 *
 * Uses Firestore's aggregate `getCountFromServer(query)` when available, which
 * returns the count without transferring documents. If the aggregate API
 * throws or is unavailable in the runtime, falls back to a bounded `getDocs`
 * read and counts the returned snapshots (design "In-use reference counting").
 */
async function countReferencingExpenses(
  familyId: string,
  categoryId: string,
): Promise<number> {
  const referencingQuery = query(
    expensesCollection(familyId),
    where('categoryId', '==', categoryId),
  );
  try {
    const snapshot = await getCountFromServer(referencingQuery);
    return snapshot.data().count;
  } catch {
    // Aggregate API unavailable/unsupported: fall back to reading the matching
    // documents and counting them.
    const snapshot = await getDocs(referencingQuery);
    return snapshot.size;
  }
}

/** Map a category document snapshot to the domain {@link FamilyCategory}. */
function readCategory(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): FamilyCategory {
  const data = snapshot.data() as CategoryDocument;
  return { id: snapshot.id, name: data.name };
}

/**
 * Live {@link CategoryRepository} backed by the initialized Firestore instance.
 */
export const categoryRepository: CategoryRepository = {
  subscribeToCategories(
    familyId: string,
    onData: (categories: FamilyCategory[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const categoriesQuery = query(
      categoriesCollection(familyId),
      orderBy('name', 'asc'),
    );
    return onSnapshot(
      categoriesQuery,
      (snapshot) => {
        onData(snapshot.docs.map(readCategory));
      },
      (error) => {
        onError(error);
      },
    );
  },

  async addCategory(familyId: string, name: string): Promise<string> {
    const docData: CategoryDocument = { name };
    const ref = await addDoc(categoriesCollection(familyId), docData);
    return ref.id;
  },

  async renameCategory(
    familyId: string,
    categoryId: string,
    name: string,
  ): Promise<void> {
    await updateDoc(
      doc(firestore, FAMILIES_COLLECTION, familyId, CATEGORIES_COLLECTION, categoryId),
      { name },
    );
  },

  async seedDefaults(familyId: string): Promise<void> {
    const batch = writeBatch(firestore);
    const categories = categoriesCollection(familyId);
    for (const name of DEFAULT_CATEGORY_SET) {
      const docData: CategoryDocument = { name };
      batch.set(doc(categories), docData);
    }
    await batch.commit();
  },

  async deleteCategory(
    familyId: string,
    categoryId: string,
  ): Promise<Result<void, InUseError>> {
    // Count referencing expenses first; a category in use by one or more
    // expenses must NOT be deleted (Req 4.9).
    const count = await countReferencingExpenses(familyId, categoryId);
    if (count > 0) {
      return err({ kind: 'in-use', count });
    }

    // No expense references the category: remove the document (Req 4.8).
    await deleteDoc(
      doc(firestore, FAMILIES_COLLECTION, familyId, CATEGORIES_COLLECTION, categoryId),
    );
    return ok(undefined);
  },
};
