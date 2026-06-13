/**
 * Firestore adapter for the `expenses` collection.
 *
 * This is the only place (alongside `authService`) that imports the Firestore
 * SDK. It bridges the SDK's `Timestamp` class to the structural
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

/** Name of the shared Firestore collection holding all family expenses. */
const EXPENSES_COLLECTION = 'expenses';

/**
 * Data-layer contract for persisting and observing expenses. Mirrors the
 * design's `ExpenseRepository` interface.
 */
export interface ExpenseRepository {
  /**
   * Persist a new expense, attributing it to `member` and stamping it with a
   * server-generated creation time. Resolves with the new document id.
   *
   * Validates: Requirements 2.3
   */
  addExpense(input: ExpenseInput, member: FamilyMember): Promise<string>;

  /**
   * Subscribe to the expense list ordered by expense date descending. `onData`
   * is invoked with the full mapped list on every snapshot; `onError` receives
   * listener errors. Returns an unsubscribe function.
   *
   * Validates: Requirements 3.1, 3.4, 3.5
   */
  subscribeToExpenses(
    onData: (expenses: Expense[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;
}

/**
 * Adapt a Firebase SDK {@link Timestamp} (or any structurally compatible value
 * with `seconds`/`nanoseconds`) to the domain's structural
 * {@link FirestoreTimestamp}. The mapper only reads `seconds` and
 * `nanoseconds`, which the SDK `Timestamp` exposes directly.
 */
function readDocument(
  snapshot: QueryDocumentSnapshot<DocumentData>,
): Expense {
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
  async addExpense(input: ExpenseInput, member: FamilyMember): Promise<string> {
    // Map the user-entered fields via the domain mapper, then override the
    // audit fields with SDK-native values: the date as a Firestore Timestamp
    // and the creation time as a server-generated timestamp (Req 2.3).
    const base = toFirestore(input, member);
    const docData = {
      ...base,
      recordedBy: member.uid,
      date: Timestamp.fromDate(input.date),
      createdAt: serverTimestamp(),
    };
    const ref = await addDoc(collection(firestore, EXPENSES_COLLECTION), docData);
    return ref.id;
  },

  subscribeToExpenses(
    onData: (expenses: Expense[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const expensesQuery = query(
      collection(firestore, EXPENSES_COLLECTION),
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
