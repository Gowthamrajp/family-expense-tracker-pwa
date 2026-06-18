/**
 * Firestore adapter for a family's `subCategories` subcollection.
 *
 * Sub-categories refine a {@link FamilyCategory} for finer spending
 * classification. Stored under `families/{familyId}/subCategories/{id}` as
 * `{ categoryId, name }` documents. This module wraps that subcollection and
 * enforces the in-use deletion rule (a sub-category referenced by any expense
 * cannot be deleted) in the data/client layer, mirroring category deletion.
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

import type {
  InUseError,
  Result,
  SubCategory,
  SubCategoryDocument,
} from '../domain/types';
import { err, ok } from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const SUB_CATEGORIES_COLLECTION = 'subCategories';
const EXPENSES_COLLECTION = 'expenses';

/** Build a reference to the family's `subCategories` subcollection. */
function subCategoriesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, SUB_CATEGORIES_COLLECTION);
}

/** Build a reference to the family's `expenses` subcollection. */
function expensesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, EXPENSES_COLLECTION);
}

/** Count expenses referencing `subCategoryId` (aggregate, with getDocs fallback). */
async function countReferencingExpenses(
  familyId: string,
  subCategoryId: string,
): Promise<number> {
  const referencingQuery = query(
    expensesCollection(familyId),
    where('subCategoryId', '==', subCategoryId),
  );
  try {
    const snapshot = await getCountFromServer(referencingQuery);
    return snapshot.data().count;
  } catch {
    const snapshot = await getDocs(referencingQuery);
    return snapshot.size;
  }
}

/** Map a sub-category document snapshot to the domain {@link SubCategory}. */
function readSubCategory(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): SubCategory {
  const data = snapshot.data() as SubCategoryDocument;
  return { id: snapshot.id, categoryId: data.categoryId, name: data.name };
}

/**
 * Data-layer contract for persisting and observing a family's sub-categories.
 */
export interface SubCategoryRepository {
  /** Subscribe to the family's sub-categories ordered by name ascending. */
  subscribeToSubCategories(
    familyId: string,
    onData: (subCategories: SubCategory[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Persist a new sub-category under `categoryId`. Resolves with the new id. */
  addSubCategory(
    familyId: string,
    categoryId: string,
    name: string,
  ): Promise<string>;

  /** Rename an existing sub-category (display name only). */
  renameSubCategory(
    familyId: string,
    subCategoryId: string,
    name: string,
  ): Promise<void>;

  /**
   * Delete a sub-category only when no expense references it. Returns
   * `err({ kind: 'in-use', count })` without deleting when referenced.
   */
  deleteSubCategory(
    familyId: string,
    subCategoryId: string,
  ): Promise<Result<void, InUseError>>;

  /**
   * Delete all sub-categories belonging to `categoryId` (used when a parent
   * category is deleted, which only happens once no expense references it).
   */
  deleteSubCategoriesForCategory(
    familyId: string,
    categoryId: string,
  ): Promise<void>;
}

/** Live {@link SubCategoryRepository} backed by the initialized Firestore instance. */
export const subCategoryRepository: SubCategoryRepository = {
  subscribeToSubCategories(
    familyId: string,
    onData: (subCategories: SubCategory[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const subCategoriesQuery = query(
      subCategoriesCollection(familyId),
      orderBy('name', 'asc'),
    );
    return onSnapshot(
      subCategoriesQuery,
      (snapshot) => onData(snapshot.docs.map(readSubCategory)),
      (error) => onError(error),
    );
  },

  async addSubCategory(
    familyId: string,
    categoryId: string,
    name: string,
  ): Promise<string> {
    const docData: SubCategoryDocument = { categoryId, name };
    const ref = await addDoc(subCategoriesCollection(familyId), docData);
    return ref.id;
  },

  async renameSubCategory(
    familyId: string,
    subCategoryId: string,
    name: string,
  ): Promise<void> {
    await updateDoc(doc(subCategoriesCollection(familyId), subCategoryId), {
      name,
    });
  },

  async deleteSubCategory(
    familyId: string,
    subCategoryId: string,
  ): Promise<Result<void, InUseError>> {
    const count = await countReferencingExpenses(familyId, subCategoryId);
    if (count > 0) {
      return err({ kind: 'in-use', count });
    }
    await deleteDoc(doc(subCategoriesCollection(familyId), subCategoryId));
    return ok(undefined);
  },

  async deleteSubCategoriesForCategory(
    familyId: string,
    categoryId: string,
  ): Promise<void> {
    const matching = await getDocs(
      query(
        subCategoriesCollection(familyId),
        where('categoryId', '==', categoryId),
      ),
    );
    if (matching.empty) {
      return;
    }
    const batch = writeBatch(firestore);
    for (const snap of matching.docs) {
      batch.delete(snap.ref);
    }
    await batch.commit();
  },
};
