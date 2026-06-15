/**
 * Firestore adapter for a family's `expenses` subcollection.
 *
 * Expenses are family-scoped, stored under
 * `families/{familyId}/expenses/{expenseId}` (see design "expenseRepository.ts"
 * (revised) and Requirements 6.1, 6.5). This is one of the few places (alongside
 * `authService` and the other repositories) that imports the Firestore SDK
 * directly. It bridges the SDK's `Timestamp` class to the structural
 * {@link FirestoreTimestamp} shape that the framework-free domain mapper
 * (`expenseMapper`) expects, keeping the domain layer free of SDK coupling.
 */
import {
  addDoc,
  collection,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { fromFirestore, toFirestore } from '../domain/expenseMapper';
import type {
  Expense,
  ExpenseDocument,
  ExpenseInput,
  FamilyMember,
} from '../domain/types';
import { firestore } from './firebase';

/** Name of the top-level families collection. */
const FAMILIES_COLLECTION = 'families';

/** Name of the per-family expenses subcollection. */
const EXPENSES_COLLECTION = 'expenses';

/**
 * Data-layer contract for persisting and observing a family's expenses. Mirrors
 * the design's revised, family-scoped `ExpenseRepository` interface.
 */
export interface ExpenseRepository {
  /**
   * Persist a new expense under the family, attributing it to `member` and
   * stamping it with a server-generated creation time. Resolves with the new
   * document id.
   *
   * Validates: Requirements 3.2, 3.3, 3.8, 6.1
   */
  addExpense(
    familyId: string,
    input: ExpenseInput,
    member: FamilyMember,
  ): Promise<string>;

  /**
   * Subscribe to the family's expense list ordered by expense date descending.
   * `onData` is invoked with the full mapped list on every snapshot; `onError`
   * receives listener errors. Returns an unsubscribe function.
   *
   * Validates: Requirements 6.1, 6.5
   */
  subscribeToExpenses(
    familyId: string,
    onData: (expenses: Expense[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
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
 * Map an expense document snapshot to the domain {@link Expense}, adapting the
 * SDK `Timestamp` fields to the structural {@link FirestoreTimestamp} shape and
 * passing through the family-scoped `categoryId`/`subSourceId` references and
 * the denormalized `recordedByName` (Req 3.2, 3.3, 6.2).
 */
function readDocument(snapshot: QueryDocumentSnapshot<DocumentData>): Expense {
  const data = snapshot.data();
  const doc: ExpenseDocument = {
    amount: data.amount,
    category: data.category,
    source: data.source,
    date: toStructuralTimestamp(data.date),
    description: data.description,
    recordedBy: data.recordedBy,
    createdAt: toStructuralTimestamp(data.createdAt),
  };

  // Pass through the optional family-scoped fields when present so the mapper
  // can surface them (Req 3.2, 3.8, 6.2). The `fromFirestore` mapper already
  // reads these; only set them when present to keep the structural document
  // free of `undefined` fields.
  if (data.categoryId !== undefined) {
    doc.categoryId = data.categoryId;
  }
  if (data.subSourceId !== undefined) {
    doc.subSourceId = data.subSourceId;
  }
  if (data.recordedByName !== undefined) {
    doc.recordedByName = data.recordedByName;
  }

  return fromFirestore(snapshot.id, doc);
}

/**
 * Convert an SDK `Timestamp` to `{ seconds, nanoseconds }`. Falls back to the
 * epoch when the field is absent (for example, a `serverTimestamp()` write not
 * yet materialized in a local snapshot).
 */
function toStructuralTimestamp(
  value: Timestamp | { seconds: number; nanoseconds: number } | null | undefined,
): { seconds: number; nanoseconds: number } {
  if (value == null) {
    return { seconds: 0, nanoseconds: 0 };
  }
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}

/**
 * Live {@link ExpenseRepository} backed by the initialized Firestore instance.
 */
export const expenseRepository: ExpenseRepository = {
  async addExpense(
    familyId: string,
    input: ExpenseInput,
    member: FamilyMember,
  ): Promise<string> {
    // Map the user-entered fields via the domain mapper, which carries the
    // family-scoped `categoryId`/`subSourceId` references (only when present)
    // and the denormalized `recordedByName` (Req 3.2, 3.3, 3.8, 6.2). Then
    // override the audit fields with SDK-native values: the date as a Firestore
    // Timestamp and the creation time as a server-generated timestamp (Req 3.3).
    const base = toFirestore(input, member);
    const docData: DocumentData = {
      ...base,
      recordedBy: member.uid,
      date: Timestamp.fromDate(input.date),
      createdAt: serverTimestamp(),
    };

    // Defensive guard: Firestore rejects `undefined` field values. The mapper
    // already omits absent `subSourceId`/`categoryId`, but strip any that
    // slipped through so we never attempt to write `undefined` (Req 3.8).
    if (docData.subSourceId === undefined) {
      delete docData.subSourceId;
    }
    if (docData.categoryId === undefined) {
      delete docData.categoryId;
    }

    const ref = await addDoc(expensesCollection(familyId), docData);
    return ref.id;
  },

  subscribeToExpenses(
    familyId: string,
    onData: (expenses: Expense[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const expensesQuery = query(
      expensesCollection(familyId),
      orderBy('date', 'desc'),
    );
    return onSnapshot(
      expensesQuery,
      (snapshot) => {
        const expenses = snapshot.docs.map(readDocument);
        onData(expenses);
      },
      (error) => {
        onError(error);
      },
    );
  },
};
