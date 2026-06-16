/**
 * Firestore adapter for a family's `subSources` subcollection.
 *
 * A sub-source is an optional, family-scoped refinement of a {@link Source}
 * that stores only a nickname and an optional last-4-digits identifier — never
 * a full card number (Req 5.6, 9.5). This module wraps
 * `families/{familyId}/subSources` and is one of the few places that imports
 * the Firestore SDK, keeping the domain layer free of SDK coupling.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getCountFromServer,
  getDocs,
  onSnapshot,
  query,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import type {
  InUseError,
  Result,
  Source,
  SubSource,
  SubSourceDocument,
  SubSourceInput,
} from '../domain/types';
import { err, ok } from '../domain/types';
import { firestore } from './firebase';

/** Name of the top-level families collection. */
const FAMILIES_COLLECTION = 'families';

/** Name of the family-scoped Firestore collection holding sub-sources. */
const SUB_SOURCES_COLLECTION = 'subSources';

/** Name of the per-family expenses subcollection (used for in-use counting). */
const EXPENSES_COLLECTION = 'expenses';

/**
 * Build the path to a family's `subSources` subcollection. Centralizing this
 * keeps every read/write scoped under `families/{familyId}` (design
 * "Firestore representation").
 */
function subSourcesPath(familyId: string): string[] {
  return ['families', familyId, SUB_SOURCES_COLLECTION];
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
 * Count the expenses in the family that reference `subSourceId`.
 *
 * Uses Firestore's aggregate `getCountFromServer(query)` when available, which
 * returns the count without transferring documents. If the aggregate API
 * throws or is unavailable in the runtime, falls back to a bounded `getDocs`
 * read and counts the returned snapshots (design "In-use reference counting").
 */
async function countReferencingExpenses(
  familyId: string,
  subSourceId: string,
): Promise<number> {
  const referencingQuery = query(
    expensesCollection(familyId),
    where('subSourceId', '==', subSourceId),
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

/**
 * Data-layer contract for persisting and observing a family's sub-sources.
 * Mirrors the design's `SubSourceRepository` interface.
 */
export interface SubSourceRepository {
  /**
   * Subscribe to the family's sub-sources. `onData` is invoked with the full
   * mapped list on every snapshot; `onError` receives listener errors. Returns
   * an unsubscribe function.
   *
   * Validates: Requirements 3.7, 5.1
   */
  subscribeToSubSources(
    familyId: string,
    onData: (subSources: SubSource[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /**
   * Persist a new sub-source under `families/{familyId}/subSources`, writing
   * ONLY `source`, `nickname`, and — when present — `last4`. No other field is
   * ever written, mirroring the security-rule allowlist and the
   * no-full-card-number guarantee (Req 5.6, 9.5). Resolves with the new
   * document id. The caller is expected to have validated `input` via
   * `validateSubSource`.
   *
   * Validates: Requirements 5.2
   */
  addSubSource(familyId: string, input: SubSourceInput): Promise<string>;

  /**
   * Delete a sub-source only when no Expense in the family references it.
   *
   * First counts the referencing expenses by querying the family's `expenses`
   * subcollection where `subSourceId == subSourceId` (see design "In-use
   * reference counting"). When the count is greater than zero, returns
   * `err({ kind: 'in-use', count })` and performs NO delete (Req 5.10). When the
   * count is zero, deletes the sub-source document and returns `ok(undefined)`
   * (Req 5.9).
   *
   * Validates: Requirements 5.8, 5.9, 5.10
   */
  deleteSubSource(
    familyId: string,
    subSourceId: string,
  ): Promise<Result<void, InUseError>>;
}

/**
 * Map a Firestore document to a domain {@link SubSource}. `last4` is included
 * only when present in the stored document so the absent case stays absent
 * (Req 5.4).
 */
function readDocument(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): SubSource {
  const data = snapshot.data();
  const base: SubSource = {
    id: snapshot.id,
    source: data.source as Source,
    nickname: data.nickname as string,
  };
  return data.last4 === undefined || data.last4 === null
    ? base
    : { ...base, last4: data.last4 as string };
}

/**
 * Live {@link SubSourceRepository} backed by the initialized Firestore instance.
 */
export const subSourceRepository: SubSourceRepository = {
  subscribeToSubSources(
    familyId: string,
    onData: (subSources: SubSource[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const [root, id, sub] = subSourcesPath(familyId);
    const subSourcesCollection = collection(firestore, root, id, sub);
    return onSnapshot(
      subSourcesCollection,
      (snapshot) => {
        const subSources = snapshot.docs.map(readDocument);
        onData(subSources);
      },
      (error) => {
        onError(error);
      },
    );
  },

  async addSubSource(
    familyId: string,
    input: SubSourceInput,
  ): Promise<string> {
    // Construct the document explicitly so ONLY the allowlisted fields are
    // written; `last4` is included only when the caller supplied one. This
    // mirrors the security-rule allowlist and guarantees no full card number
    // is ever persisted (Req 5.6, 9.5).
    const docData: SubSourceDocument =
      input.last4 === undefined
        ? { source: input.source, nickname: input.nickname }
        : {
            source: input.source,
            nickname: input.nickname,
            last4: input.last4,
          };
    const [root, id, sub] = subSourcesPath(familyId);
    const ref = await addDoc(collection(firestore, root, id, sub), docData);
    return ref.id;
  },

  async deleteSubSource(
    familyId: string,
    subSourceId: string,
  ): Promise<Result<void, InUseError>> {
    // Count referencing expenses first; a sub-source in use by one or more
    // expenses must NOT be deleted (Req 5.10).
    const count = await countReferencingExpenses(familyId, subSourceId);
    if (count > 0) {
      return err({ kind: 'in-use', count });
    }

    // No expense references the sub-source: remove the document (Req 5.9).
    const [root, id, sub] = subSourcesPath(familyId);
    await deleteDoc(doc(firestore, root, id, sub, subSourceId));
    return ok(undefined);
  },
};
