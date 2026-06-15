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
  doc,
  onSnapshot,
  orderBy,
  query,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { DEFAULT_CATEGORY_SET } from '../domain/category';
import type { CategoryDocument, FamilyCategory } from '../domain/types';
import { firestore } from './firebase';

/** Name of the top-level families collection. */
const FAMILIES_COLLECTION = 'families';

/** Name of the per-family categories subcollection. */
const CATEGORIES_COLLECTION = 'categories';

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
   * Seed the family's categories with the {@link DEFAULT_CATEGORY_SET}, writing
   * one document per default name in a single batch. Used during family
   * creation.
   *
   * Validates: Requirements 4.1
   */
  seedDefaults(familyId: string): Promise<void>;
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

  async seedDefaults(familyId: string): Promise<void> {
    const batch = writeBatch(firestore);
    const categories = categoriesCollection(familyId);
    for (const name of DEFAULT_CATEGORY_SET) {
      const docData: CategoryDocument = { name };
      batch.set(doc(categories), docData);
    }
    await batch.commit();
  },
};
