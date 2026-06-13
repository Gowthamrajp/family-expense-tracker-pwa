/**
 * Mapping between the client-side expense model and the Firestore document
 * representation.
 *
 * This layer is framework-free: it converts between {@link Date} and the
 * structural {@link FirestoreTimestamp} shape rather than depending on the
 * Firebase SDK's `Timestamp` class. The data layer is responsible for adapting
 * SDK `Timestamp` instances to/from this structural type.
 */

import type {
  Expense,
  ExpenseDocument,
  ExpenseInput,
  FamilyMember,
  FirestoreTimestamp,
} from './types';

const MILLIS_PER_SECOND = 1000;
const NANOS_PER_MILLI = 1_000_000;

/** Convert a {@link Date} to the structural {@link FirestoreTimestamp} shape. */
export function dateToTimestamp(date: Date): FirestoreTimestamp {
  const millis = date.getTime();
  // Use floor so the seconds/nanoseconds split is correct for negative epochs.
  const seconds = Math.floor(millis / MILLIS_PER_SECOND);
  const nanoseconds = (millis - seconds * MILLIS_PER_SECOND) * NANOS_PER_MILLI;
  return { seconds, nanoseconds };
}

/** Convert a {@link FirestoreTimestamp} back to a {@link Date}. */
export function timestampToDate(timestamp: FirestoreTimestamp): Date {
  const millis =
    timestamp.seconds * MILLIS_PER_SECOND +
    Math.round(timestamp.nanoseconds / NANOS_PER_MILLI);
  return new Date(millis);
}

/**
 * Map a validated {@link ExpenseInput} to an {@link ExpenseDocument} ready to
 * persist. Sets `recordedBy` to the submitting member's uid and stamps the
 * document with a creation timestamp.
 *
 * @param input - Validated user-entered fields.
 * @param member - The authenticated submitter.
 * @param createdAt - Creation time; defaults to now so callers may inject a
 *   deterministic value (the data layer may instead use a server timestamp).
 *
 * Validates: Requirements 2.3
 */
export function toFirestore(
  input: ExpenseInput,
  member: FamilyMember,
  createdAt: Date = new Date(),
): ExpenseDocument {
  return {
    amount: input.amount,
    category: input.category,
    source: input.source,
    date: dateToTimestamp(input.date),
    description: input.description,
    recordedBy: member.uid,
    createdAt: dateToTimestamp(createdAt),
  };
}

/**
 * Reconstruct a full {@link Expense} from a Firestore document and its id,
 * converting stored timestamps back to {@link Date} values.
 *
 * Validates: Requirements 2.3
 */
export function fromFirestore(id: string, doc: ExpenseDocument): Expense {
  return {
    id,
    amount: doc.amount,
    category: doc.category as Expense['category'],
    source: doc.source as Expense['source'],
    date: timestampToDate(doc.date),
    description: doc.description,
    recordedBy: doc.recordedBy,
    createdAt: timestampToDate(doc.createdAt),
  };
}
