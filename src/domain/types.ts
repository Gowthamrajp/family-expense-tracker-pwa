/**
 * Core domain types for the Family Expense Tracker.
 *
 * These types are framework- and I/O-free so they can be shared across the
 * domain, data, state, and UI layers and exercised by unit and property tests.
 */

/**
 * Fixed expense category enumeration for the MVP (no management UI).
 * See design "Data Models".
 */
export type Category =
  | 'Groceries'
  | 'Utilities'
  | 'Transport'
  | 'Dining'
  | 'Healthcare'
  | 'Entertainment'
  | 'Shopping'
  | 'Other';

/** All valid {@link Category} values, useful for selects and generators. */
export const CATEGORIES: readonly Category[] = [
  'Groceries',
  'Utilities',
  'Transport',
  'Dining',
  'Healthcare',
  'Entertainment',
  'Shopping',
  'Other',
] as const;

/**
 * Funding method used to pay for an expense. Fixed enumeration for the MVP.
 * See requirements Glossary "Source".
 */
export type Source =
  | 'Cash'
  | 'Credit Card'
  | 'Reward Points'
  | 'Food Coupon'
  | 'Cashback Points';

/** All valid {@link Source} values, useful for selects and generators. */
export const SOURCES: readonly Source[] = [
  'Cash',
  'Credit Card',
  'Reward Points',
  'Food Coupon',
  'Cashback Points',
] as const;

/**
 * Validated expense input ready to persist. Holds no id or audit fields;
 * those are added when the expense is written to the Data_Store.
 *
 * Constraints (enforced by domain validation):
 * - amount: 0.01 .. 999,999,999.99 with at most 2 decimal places
 * - date: 2000-01-01 .. today
 * - description: 0..280 characters (may be empty)
 */
export interface ExpenseInput {
  amount: number;
  category: Category;
  source: Source;
  date: Date;
  description: string;
}

/**
 * Full client-side expense as read back from the Data_Store, extending
 * {@link ExpenseInput} with identity and audit fields.
 */
export interface Expense extends ExpenseInput {
  id: string;
  /** FamilyMember uid of the submitter. */
  recordedBy: string;
  /** Creation timestamp recorded with the expense. */
  createdAt: Date;
}

/**
 * Firestore representation of an expense. Dates are stored as Firestore
 * Timestamp-like values; this app-level type uses a minimal structural shape
 * so the domain layer does not depend on the Firebase SDK.
 */
export interface FirestoreTimestamp {
  /** Whole seconds since the Unix epoch. */
  seconds: number;
  /** Fractional seconds expressed in nanoseconds. */
  nanoseconds: number;
}

/**
 * Document shape stored in the Firestore `expenses` collection.
 * See design "ExpenseDocument (Firestore representation)".
 */
export interface ExpenseDocument {
  amount: number;
  category: string;
  source: string;
  date: FirestoreTimestamp;
  description: string;
  /** request.auth.uid of the submitter. */
  recordedBy: string;
  /** serverTimestamp() at creation. */
  createdAt: FirestoreTimestamp;
}

/**
 * An authenticated user belonging to the shared family group.
 * The display label resolves as `displayName ?? email ?? 'Signed in'`.
 */
export interface FamilyMember {
  uid: string;
  displayName: string | null;
  email: string | null;
}

/**
 * Aggregation output: one total per distinct grouping key
 * (category name, source name, or "YYYY-MM").
 */
export interface GroupTotal {
  key: string;
  /** Sum of amounts for the group, as a 2-decimal number. */
  total: number;
}

/**
 * Result helper for explicit success/error handling in pure functions.
 * Discriminated by the `ok` field.
 */
export type Result<T, E> =
  | { ok: true; value: T }
  | { ok: false; error: E };

/** Construct a successful {@link Result}. */
export function ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

/** Construct a failed {@link Result}. */
export function err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}
