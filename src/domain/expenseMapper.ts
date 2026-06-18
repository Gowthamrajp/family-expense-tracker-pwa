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
  ExpenseUpdateDocument,
  FamilyCategory,
  FamilyMember,
  FirestoreTimestamp,
  Source,
  SubCategory,
  SubSource,
} from './types';
import { resolveMemberLabel } from './member';

/**
 * Display-ready projection of an {@link Expense} for list rendering, with the
 * stored `categoryId`/`subSourceId` references resolved to human-readable
 * labels.
 *
 * See design "expenseMapper.ts" (`resolveLabels` -> `ExpenseRow`) and
 * Requirements 6.2, 6.3.
 */
export interface ExpenseRow {
  /** Originating expense id, for keying rows. */
  id: string;
  /**
   * Resolved category display name: the family {@link FamilyCategory} matched
   * by `categoryId`, falling back to the legacy `category` string when the id
   * is absent or unresolved (Req 6.2).
   */
  categoryName: string;
  /**
   * Resolved {@link SubSource} nickname when `subSourceId` is present and
   * matches a known sub-source; otherwise omitted (Req 6.3).
   */
  subSourceNickname?: string;
  /**
   * Resolved {@link SubCategory} name when `subCategoryId` is present and
   * matches a known sub-category; otherwise omitted.
   */
  subCategoryName?: string;
  /** Funding method label. */
  sourceName: Source;
  amount: number;
  date: Date;
  description: string;
  /** Denormalized recording-member display label (Req 6.2). */
  recordedByName: string;
}

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
 * Carries the family-scoped `categoryId` and the optional `subSourceId`
 * references and denormalizes the recording member's display label into
 * `recordedByName`. The legacy `category` string is still written for backward
 * compatibility with existing data/consumers until later tasks remove it.
 *
 * Validates: Requirements 2.3, 3.3, 6.2
 */
export function toFirestore(
  input: ExpenseInput,
  member: FamilyMember,
  createdAt: Date = new Date(),
): ExpenseDocument {
  const doc: ExpenseDocument = {
    amount: input.amount,
    category: input.category,
    source: input.source,
    date: dateToTimestamp(input.date),
    description: input.description,
    recordedBy: member.uid,
    recordedByName: resolveMemberLabel(member),
    createdAt: dateToTimestamp(createdAt),
  };

  if (input.categoryId !== undefined) {
    doc.categoryId = input.categoryId;
  }
  if (input.subCategoryId !== undefined) {
    doc.subCategoryId = input.subCategoryId;
  }
  if (input.subSourceId !== undefined) {
    doc.subSourceId = input.subSourceId;
  }

  return doc;
}

/**
 * Map an edited {@link ExpenseInput} onto an {@link ExpenseUpdateDocument} for
 * persisting an expense edit. Carries the edited user fields (amount,
 * categoryId, source, optional subSourceId, date, description) and stamps the
 * audit fields `updatedBy` (the editing member's uid) and `updatedAt`.
 *
 * It intentionally does NOT write `recordedBy` or `createdAt`, so the original
 * recorder identity and creation time are preserved unchanged when the data
 * layer merges this payload onto the stored document (Req 3.15).
 *
 * @param input - The re-validated edited fields.
 * @param member - The authenticated editor.
 * @param updatedAt - Edit time; defaults to now so callers may inject a
 *   deterministic value (the data layer may instead use a server timestamp),
 *   consistent with how {@link toFirestore} handles `createdAt`.
 *
 * Validates: Requirements 3.15, 6.2
 */
export function toUpdateFields(
  input: ExpenseInput,
  member: FamilyMember,
  updatedAt: Date = new Date(),
): ExpenseUpdateDocument {
  const doc: ExpenseUpdateDocument = {
    amount: input.amount,
    categoryId: input.categoryId ?? input.category,
    source: input.source,
    date: dateToTimestamp(input.date),
    description: input.description,
    updatedBy: member.uid,
    updatedAt: dateToTimestamp(updatedAt),
  };

  if (input.subCategoryId !== undefined) {
    doc.subCategoryId = input.subCategoryId;
  }
  if (input.subSourceId !== undefined) {
    doc.subSourceId = input.subSourceId;
  }

  return doc;
}

/**
 * Reconstruct a full {@link Expense} from a Firestore document and its id,
 * converting stored timestamps back to {@link Date} values. Reads the optional
 * family-scoped `categoryId`/`subSourceId` references and the denormalized
 * `recordedByName` in addition to the legacy fields, and the optional
 * `updatedBy`/`updatedAt` audit fields written when an expense is edited so an
 * edited expense round-trips its audit metadata (Req 3.15, 6.2).
 *
 * Validates: Requirements 2.3, 3.15, 6.2
 */
export function fromFirestore(id: string, doc: ExpenseDocument): Expense {
  const expense: Expense = {
    id,
    amount: doc.amount,
    category: doc.category as Expense['category'],
    source: doc.source as Expense['source'],
    date: timestampToDate(doc.date),
    description: doc.description,
    recordedBy: doc.recordedBy,
    createdAt: timestampToDate(doc.createdAt),
  };

  if (doc.categoryId !== undefined) {
    expense.categoryId = doc.categoryId;
  }
  if (doc.subCategoryId !== undefined) {
    expense.subCategoryId = doc.subCategoryId;
  }
  if (doc.subSourceId !== undefined) {
    expense.subSourceId = doc.subSourceId;
  }
  if (doc.recordedByName !== undefined) {
    expense.recordedByName = doc.recordedByName;
  }
  if (doc.updatedBy !== undefined) {
    expense.updatedBy = doc.updatedBy;
  }
  if (doc.updatedAt !== undefined) {
    expense.updatedAt = timestampToDate(doc.updatedAt);
  }

  return expense;
}

/**
 * Resolve a stored {@link Expense}'s `categoryId`/`subSourceId` references to
 * display labels, producing a render-ready {@link ExpenseRow}.
 *
 * Resolution rules:
 * - `categoryName`: the family {@link FamilyCategory} whose id matches
 *   `exp.categoryId`. When `categoryId` is absent or unresolved, falls back to
 *   the legacy `exp.category` string (Req 6.2).
 * - `subSourceNickname`: the {@link SubSource} whose id matches
 *   `exp.subSourceId`. Omitted when `subSourceId` is absent or unresolved
 *   (Req 6.3).
 * - `recordedByName`: the denormalized label on the expense, falling back to
 *   the recording uid when absent (Req 6.2).
 *
 * Validates: Requirements 6.2, 6.3
 */
export function resolveLabels(
  exp: Expense,
  cats: FamilyCategory[],
  subs: SubSource[],
  subCats: SubCategory[] = [],
): ExpenseRow {
  const matchedCategory =
    exp.categoryId !== undefined
      ? cats.find((category) => category.id === exp.categoryId)
      : undefined;
  const categoryName = matchedCategory?.name ?? exp.category;

  const matchedSubCategory =
    exp.subCategoryId !== undefined
      ? subCats.find((sub) => sub.id === exp.subCategoryId)
      : undefined;

  const matchedSubSource =
    exp.subSourceId !== undefined
      ? subs.find((sub) => sub.id === exp.subSourceId)
      : undefined;

  const row: ExpenseRow = {
    id: exp.id,
    categoryName,
    sourceName: exp.source,
    amount: exp.amount,
    date: exp.date,
    description: exp.description,
    recordedByName: exp.recordedByName ?? exp.recordedBy,
  };

  if (matchedSubCategory !== undefined) {
    row.subCategoryName = matchedSubCategory.name;
  }
  if (matchedSubSource !== undefined) {
    row.subSourceNickname = matchedSubSource.nickname;
  }

  return row;
}
