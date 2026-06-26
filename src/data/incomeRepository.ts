/**
 * Firestore adapter for a family's `incomes` subcollection.
 *
 * Income records track money coming IN to the family and are family-scoped,
 * stored under `families/{familyId}/incomes/{incomeId}`. This mirrors
 * {@link ./expenseRepository} but is leaner: income has no category/sub-source
 * references, only a free-text `source` label plus amount/date/description.
 * One of the few modules that imports the Firestore SDK directly.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { resolveMemberLabel } from '../domain/member';
import type {
  FamilyMember,
  Income,
  IncomeInput,
} from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const INCOMES_COLLECTION = 'incomes';

/** Build a reference to the `families/{familyId}/incomes` subcollection. */
function incomesCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, INCOMES_COLLECTION);
}

/** Convert an SDK Timestamp (or null) to a Date, defaulting to the epoch. */
function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(0);
}

/** Map an income document snapshot to the domain {@link Income}. */
function readIncome(snapshot: QueryDocumentSnapshot<DocumentData>): Income {
  const data = snapshot.data();
  const income: Income = {
    id: snapshot.id,
    amount: data.amount,
    source: data.source ?? '',
    date: tsToDate(data.date),
    description: data.description ?? '',
    recordedBy: data.recordedBy,
    createdAt: tsToDate(data.createdAt),
  };
  if (data.recordedByName !== undefined) {
    income.recordedByName = data.recordedByName;
  }
  if (data.updatedBy !== undefined) {
    income.updatedBy = data.updatedBy;
  }
  if (data.updatedAt !== undefined) {
    income.updatedAt = tsToDate(data.updatedAt);
  }
  return income;
}

/** Data-layer contract for persisting and observing a family's income. */
export interface IncomeRepository {
  /** Subscribe to the family's income list ordered by date descending. */
  subscribeToIncomes(
    familyId: string,
    onData: (incomes: Income[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Persist a new income record attributed to `member`. Resolves with its id. */
  addIncome(
    familyId: string,
    input: IncomeInput,
    member: FamilyMember,
  ): Promise<string>;

  /** Update an existing income with re-validated fields (preserves recorder/createdAt). */
  updateIncome(
    familyId: string,
    incomeId: string,
    input: IncomeInput,
    member: FamilyMember,
  ): Promise<void>;

  /** Delete an income record. Any family member may delete any income. */
  deleteIncome(familyId: string, incomeId: string): Promise<void>;
}

/** Live {@link IncomeRepository} backed by the initialized Firestore instance. */
export const incomeRepository: IncomeRepository = {
  subscribeToIncomes(
    familyId: string,
    onData: (incomes: Income[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const incomesQuery = query(incomesCollection(familyId), orderBy('date', 'desc'));
    return onSnapshot(
      incomesQuery,
      (snapshot) => onData(snapshot.docs.map(readIncome)),
      (error) => onError(error),
    );
  },

  async addIncome(
    familyId: string,
    input: IncomeInput,
    member: FamilyMember,
  ): Promise<string> {
    const docData: DocumentData = {
      amount: input.amount,
      source: input.source,
      date: Timestamp.fromDate(input.date),
      description: input.description,
      recordedBy: member.uid,
      recordedByName: resolveMemberLabel(member),
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(incomesCollection(familyId), docData);
    return ref.id;
  },

  async updateIncome(
    familyId: string,
    incomeId: string,
    input: IncomeInput,
    member: FamilyMember,
  ): Promise<void> {
    // Write only the editable fields plus the audit fields; recordedBy/createdAt
    // are intentionally left untouched to preserve the original recorder.
    const docData: DocumentData = {
      amount: input.amount,
      source: input.source,
      date: Timestamp.fromDate(input.date),
      description: input.description,
      updatedBy: member.uid,
      updatedAt: serverTimestamp(),
    };
    await updateDoc(doc(incomesCollection(familyId), incomeId), docData);
  },

  async deleteIncome(familyId: string, incomeId: string): Promise<void> {
    await deleteDoc(doc(incomesCollection(familyId), incomeId));
  },
};
