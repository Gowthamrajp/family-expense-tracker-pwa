/**
 * Firestore adapter for a family's `sources` subcollection plus the rename
 * backfill and in-use deletion logic for payment Sources.
 *
 * Sources are family-scoped, editable data stored under
 * `families/{familyId}/sources/{id}` as `{ name }`. Expenses, sub-sources, and
 * recurring rules store the Source by NAME (not id), so renaming a Source
 * backfills those references to the new name in a batch. Deletion is blocked
 * (in the data/client layer) while any expense, sub-source, or recurring rule
 * still uses the Source.
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
  where,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { DEFAULT_SOURCE_SET } from '../domain/types';
import type {
  FamilySource,
  InUseError,
  Result,
  SourceDocument,
} from '../domain/types';
import { err, ok } from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const SOURCES_COLLECTION = 'sources';
const EXPENSES_COLLECTION = 'expenses';
const SUB_SOURCES_COLLECTION = 'subSources';
const RECURRING_COLLECTION = 'recurringRules';

function sourcesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, SOURCES_COLLECTION);
}
function expensesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, EXPENSES_COLLECTION);
}
function subSourcesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, SUB_SOURCES_COLLECTION);
}
function recurringCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, RECURRING_COLLECTION);
}

/** Count docs in `coll` whose `source` field equals `name` (aggregate + fallback). */
async function countBySourceName(
  collRef: ReturnType<typeof collection>,
  name: string,
): Promise<number> {
  const q = query(collRef, where('source', '==', name));
  try {
    const snap = await getCountFromServer(q);
    return snap.data().count;
  } catch {
    const snap = await getDocs(q);
    return snap.size;
  }
}

/** Map a source document snapshot to the domain {@link FamilySource}. */
function readSource(snapshot: QueryDocumentSnapshot<DocumentData>): FamilySource {
  const data = snapshot.data() as SourceDocument;
  return { id: snapshot.id, name: data.name };
}

/**
 * Data-layer contract for persisting and observing a family's payment Sources.
 */
export interface SourceRepository {
  subscribeToSources(
    familyId: string,
    onData: (sources: FamilySource[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Persist a new Source `{ name }`. Resolves with the new id. */
  addSource(familyId: string, name: string): Promise<string>;

  /** Seed the family's Sources with the default set (used at family creation). */
  seedDefaults(familyId: string): Promise<void>;

  /**
   * Seed defaults only when the family has no Sources yet. Used to backfill
   * families created before Sources became managed data. Best-effort.
   */
  seedDefaultsIfEmpty(familyId: string): Promise<void>;

  /**
   * Rename a Source and backfill every expense, sub-source, and recurring rule
   * that referenced the old name so they point at the new name. Done in a
   * single batched write after collecting the affected documents.
   */
  renameSource(
    familyId: string,
    sourceId: string,
    oldName: string,
    newName: string,
  ): Promise<void>;

  /**
   * Delete a Source only when no expense, sub-source, or recurring rule uses it
   * (by name). Returns `err({ kind: 'in-use', count })` with the combined count
   * without deleting when still referenced.
   */
  deleteSource(
    familyId: string,
    sourceId: string,
    name: string,
  ): Promise<Result<void, InUseError>>;
}

/** Live {@link SourceRepository} backed by the initialized Firestore instance. */
export const sourceRepository: SourceRepository = {
  subscribeToSources(
    familyId: string,
    onData: (sources: FamilySource[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const sourcesQuery = query(sourcesCollection(familyId), orderBy('name', 'asc'));
    return onSnapshot(
      sourcesQuery,
      (snapshot) => onData(snapshot.docs.map(readSource)),
      (error) => onError(error),
    );
  },

  async addSource(familyId: string, name: string): Promise<string> {
    const docData: SourceDocument = { name };
    const ref = await addDoc(sourcesCollection(familyId), docData);
    return ref.id;
  },

  async seedDefaults(familyId: string): Promise<void> {
    const batch = writeBatch(firestore);
    const sources = sourcesCollection(familyId);
    for (const name of DEFAULT_SOURCE_SET) {
      const docData: SourceDocument = { name };
      batch.set(doc(sources), docData);
    }
    await batch.commit();
  },

  async seedDefaultsIfEmpty(familyId: string): Promise<void> {
    const existing = await getDocs(sourcesCollection(familyId));
    if (!existing.empty) {
      return;
    }
    const batch = writeBatch(firestore);
    for (const name of DEFAULT_SOURCE_SET) {
      batch.set(doc(sourcesCollection(familyId)), { name });
    }
    await batch.commit();
  },

  async renameSource(
    familyId: string,
    sourceId: string,
    oldName: string,
    newName: string,
  ): Promise<void> {
    // Collect every document that references the OLD source name.
    const [expensesSnap, subSourcesSnap, recurringSnap] = await Promise.all([
      getDocs(query(expensesCollection(familyId), where('source', '==', oldName))),
      getDocs(query(subSourcesCollection(familyId), where('source', '==', oldName))),
      getDocs(query(recurringCollection(familyId), where('source', '==', oldName))),
    ]);

    // Firestore batches cap at 500 writes; chunk to stay safe.
    const refs = [
      doc(sourcesCollection(familyId), sourceId),
      ...expensesSnap.docs.map((d) => d.ref),
      ...subSourcesSnap.docs.map((d) => d.ref),
      ...recurringSnap.docs.map((d) => d.ref),
    ];
    const CHUNK = 400;
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(firestore);
      for (const ref of refs.slice(i, i + CHUNK)) {
        // The source doc stores { name }; all others store { source }. Both are
        // updated to the new name. We set both fields harmlessly only on the
        // source doc by branching on whether it is the source ref.
        if (ref.path === doc(sourcesCollection(familyId), sourceId).path) {
          batch.update(ref, { name: newName });
        } else {
          batch.update(ref, { source: newName });
        }
      }
      await batch.commit();
    }
  },

  async deleteSource(
    familyId: string,
    sourceId: string,
    name: string,
  ): Promise<Result<void, InUseError>> {
    const [expenseCount, subSourceCount, recurringCount] = await Promise.all([
      countBySourceName(expensesCollection(familyId), name),
      countBySourceName(subSourcesCollection(familyId), name),
      countBySourceName(recurringCollection(familyId), name),
    ]);
    const count = expenseCount + subSourceCount + recurringCount;
    if (count > 0) {
      return err({ kind: 'in-use', count });
    }
    await deleteDoc(doc(sourcesCollection(familyId), sourceId));
    return ok(undefined);
  },
};
