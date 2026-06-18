/**
 * Core domain types for the Family Expense Tracker.
 *
 * These types are framework- and I/O-free so they can be shared across the
 * domain, data, state, and UI layers and exercised by unit and property tests.
 *
 * --------------------------------------------------------------------------
 * EXPANSION NOTE (family groups / custom categories / sub-sources):
 *
 * This revision expands the MVP data model toward family-scoped data (see
 * design "Data Models", "Firestore representation", and "Migration model").
 * To keep the project compiling while consumers are migrated incrementally,
 * a few backward-compatible shims are intentionally retained:
 *
 *   1. The legacy string-union {@link Category} (+ {@link CATEGORIES}) is kept
 *      as-is. The design's canonical category object `{ id, name }` is added
 *      here as {@link FamilyCategory}. Later tasks (24/26/31) migrate consumers
 *      from the string union to family-scoped categories and, at that point,
 *      `FamilyCategory` should be renamed to `Category` and the legacy union
 *      removed.
 *   2. {@link ExpenseInput} keeps its legacy required `category` field and adds
 *      `categoryId`/`subSourceId` as OPTIONAL. Later tasks (24/26/31) make
 *      `categoryId` the canonical reference and remove `category`.
 *   3. {@link Expense} adds `recordedByName` as OPTIONAL and {@link ExpenseDocument}
 *      adds `categoryId`/`subSourceId`/`recordedByName` as OPTIONAL so existing
 *      mapper/repository code keeps compiling until those tasks wire them.
 *
 * `Source`/`SOURCES` remain a fixed enumeration and are unchanged.
 * --------------------------------------------------------------------------
 */

/**
 * Legacy fixed expense category enumeration from the MVP (no management UI).
 *
 * SHIM: Retained so existing validation/mapping/aggregation/UI code keeps
 * compiling. The expanded design models categories as family-scoped data
 * objects ({@link FamilyCategory}); later tasks (24/26/31) migrate consumers to
 * `categoryId` and this union (and {@link CATEGORIES}) will be removed.
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

/** All valid legacy {@link Category} values, useful for selects and generators. */
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
 * Funding method used to pay for an expense. Originally a fixed enumeration;
 * now family-managed data, so a Source is any non-empty name string. The
 * default set below seeds new families and documents the common values.
 * Stored on Expenses/SubSources/RecurringRules by NAME (not id), so renaming a
 * Source backfills those references to the new name.
 */
export type Source = string;

/**
 * Default Sources seeded when a family is created. Family members can add,
 * rename, or remove Sources afterward.
 */
export const SOURCES: readonly string[] = [
  'Cash',
  'Credit Card',
  'Reward Points',
  'Food Coupon',
  'Cashback Points',
] as const;

/** Alias for {@link SOURCES} read as the seed/default set. */
export const DEFAULT_SOURCE_SET: readonly string[] = SOURCES;

/**
 * Family-scoped, editable payment Source. Stored under
 * `families/{familyId}/sources/{id}` as `{ name }`. The `name` is what is
 * written onto expenses/sub-sources, so it is unique within the family once
 * normalized.
 */
export interface FamilySource {
  id: string;
  name: string;
}

/** Document shape stored at `families/{familyId}/sources/{sourceId}`. */
export interface SourceDocument {
  name: string;
}

/**
 * A family group. Members share all expense/category/sub-source data.
 * See design "Family-scoped domain models" (Req 2.2, 2.5).
 */
export interface Family {
  id: string;
  name: string | null;
  /** Unique, shareable invite code (Req 2.2). */
  inviteCode: string;
  createdAt: Date;
  /** Uids of the members of this family (Req 2.5). */
  memberUids: string[];
  /**
   * Uid of the family's owner — the member who created it (Req 12.1). May be
   * an empty string for legacy families created before ownership existed,
   * until backfilled (Req 12.2).
   */
  ownerUid: string;
}

/**
 * Family-scoped, editable category (the design's canonical `Category` object).
 *
 * SHIM NAME: this is named `FamilyCategory` to coexist with the legacy
 * {@link Category} string union while consumers are migrated. Later tasks
 * (24/26/31) rename this to `Category`. The `name` is unique within the family
 * once normalized (Req 4.3, 4.5).
 */
export interface FamilyCategory {
  id: string;
  name: string;
}

/**
 * Family-scoped, editable Sub-category that refines a {@link FamilyCategory}
 * for finer spending classification (e.g. Food → Groceries). Optional on an
 * expense. `name` is unique within its parent category once normalized.
 */
export interface SubCategory {
  id: string;
  /** Id of the parent {@link FamilyCategory} this sub-category belongs to. */
  categoryId: string;
  /** Display name, unique within the parent category (case/space-insensitive). */
  name: string;
}

/** Validated sub-category input ready to persist (no id). */
export type SubCategoryInput = Omit<SubCategory, 'id'>;

/** Document shape stored at `families/{familyId}/subCategories/{subCategoryId}`. */
export interface SubCategoryDocument {
  categoryId: string;
  name: string;
}

/**
 * Optional, family-scoped refinement of a {@link Source}. Stores a nickname and
 * an optional last-4 identifier ONLY — never a full card number (Req 5.6, 9.5).
 * See design "Family-scoped domain models".
 */
export interface SubSource {
  id: string;
  /** The parent funding method this sub-source refines. */
  source: Source;
  /** Required, non-empty nickname (Req 5.2). */
  nickname: string;
  /** Exactly 4 digits when present (Req 5.4). */
  last4?: string;
}

/** Validated sub-source input ready to persist (no id). */
export type SubSourceInput = Omit<SubSource, 'id'>;

/**
 * Raw, unvalidated sub-source values captured from the add-sub-source form.
 * `last4` is raw user input, validated to 4 digits or rejected (Req 5.4, 5.5).
 */
export interface SubSourceFormInput {
  source: Source;
  nickname: string;
  last4: string | null;
}

/**
 * Validated expense input ready to persist. Holds no id or audit fields;
 * those are added when the expense is written to the Data_Store.
 *
 * Constraints (enforced by domain validation):
 * - amount: 0.01 .. 999,999,999.99 with at most 2 decimal places
 * - date: 2000-01-01 .. today
 * - description: 0..280 characters (may be empty)
 *
 * SHIM: the legacy required `category` field is retained for now; the expanded
 * design replaces it with a `categoryId` reference to a {@link FamilyCategory}
 * plus an optional `subSourceId` reference (added below as OPTIONAL). Later
 * tasks (24/26/31) make `categoryId` canonical and remove `category`.
 */
export interface ExpenseInput {
  amount: number;
  /** SHIM (legacy): fixed-enum category; superseded by `categoryId`. */
  category: Category;
  source: Source;
  /** Reference to a family {@link FamilyCategory} (Req 3.2, 3.5). Optional during migration. */
  categoryId?: string;
  /** Optional reference to a {@link SubCategory} under the chosen category. */
  subCategoryId?: string;
  /** Optional reference to a {@link SubSource} (Req 3.8). */
  subSourceId?: string;
  date: Date;
  description: string;
}

/**
 * Full client-side expense as read back from the Data_Store, extending
 * {@link ExpenseInput} with identity and audit fields.
 */
export interface Expense extends ExpenseInput {
  id: string;
  /** FamilyMember uid of the submitter (Req 3.3). */
  recordedBy: string;
  /**
   * Denormalized display name of the recording member for list rendering
   * (Req 6.2). Optional during migration; later tasks populate it on write.
   */
  recordedByName?: string;
  /** Creation timestamp recorded with the expense (Req 3.3). */
  createdAt: Date;
  /**
   * Uid of the member who last edited the expense, set on edit (Req 3.15).
   * Absent until the expense has been edited at least once.
   */
  updatedBy?: string;
  /**
   * Timestamp of the last edit, set on edit (Req 3.15). Absent until the
   * expense has been edited at least once.
   */
  updatedAt?: Date;
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
 * Document shape stored in the family `expenses` subcollection.
 * See design "Firestore representation".
 *
 * SHIM: the legacy `category` string is retained alongside the new optional
 * `categoryId`/`subSourceId`/`recordedByName` fields so existing mapper and
 * repository code keeps compiling until later tasks (24/26/31) switch to the
 * family-scoped references.
 */
export interface ExpenseDocument {
  amount: number;
  /** SHIM (legacy): fixed-enum category value; superseded by `categoryId`. */
  category: string;
  source: string;
  /** Family Category id (Req 3.2). Optional during migration. */
  categoryId?: string;
  /** Family SubCategory id, when selected. */
  subCategoryId?: string;
  /** Family SubSource id, when selected (Req 3.8). */
  subSourceId?: string;
  date: FirestoreTimestamp;
  description: string;
  /** request.auth.uid of the submitter. */
  recordedBy: string;
  /** Denormalized recording-member display name (Req 6.2). */
  recordedByName?: string;
  /** serverTimestamp() at creation. */
  createdAt: FirestoreTimestamp;
  /** Uid of the member who last edited the expense, set on edit (Req 3.15). */
  updatedBy?: string;
  /** serverTimestamp() at edit, set on edit (Req 3.15). */
  updatedAt?: FirestoreTimestamp;
}

/**
 * Fields written by `updateExpense` when a Family_Member edits an existing
 * Expense. `recordedBy`/`createdAt` are intentionally absent so the original
 * recorder identity and creation time are preserved (Req 3.15); `updatedBy`/
 * `updatedAt` are stamped with the editor and the edit time.
 * See design "Firestore representation".
 */
export interface ExpenseUpdateDocument {
  amount: number;
  /** Family Category id (Req 3.2, 3.14). */
  categoryId: string;
  /** Family SubCategory id, when selected; omitted/field-deleted otherwise. */
  subCategoryId?: string;
  source: string;
  /** Omitted (or field-deleted) when no sub-source is chosen. */
  subSourceId?: string;
  date: FirestoreTimestamp;
  description: string;
  /** request.auth.uid of the editor (Req 3.15). */
  updatedBy: string;
  /** serverTimestamp() at edit (Req 3.15). */
  updatedAt: FirestoreTimestamp;
}

/**
 * Document shape stored at `families/{familyId}`.
 * See design "Firestore representation".
 */
export interface FamilyDocument {
  name: string | null;
  inviteCode: string;
  createdAt: FirestoreTimestamp;
  memberUids: string[];
  /**
   * Uid of the family's owner (Req 12.1). Absent on legacy family documents
   * created before ownership existed, until backfilled (Req 12.2).
   */
  ownerUid?: string;
}

/** Document shape stored at `families/{familyId}/categories/{categoryId}`. */
export interface CategoryDocument {
  name: string;
}

/**
 * How a family's monthly budget target is expressed:
 * - `amount`: a fixed rupee cap per month.
 * - `percent`: a percentage of the PREVIOUS month's total spend.
 */
export type BudgetMode = 'amount' | 'percent';

/**
 * A family's single, rolling monthly budget. Applies to every calendar month.
 * Stored at `families/{familyId}/settings/budget`. Exactly one of
 * `amount`/`percent` is meaningful depending on `mode`.
 */
export interface Budget {
  mode: BudgetMode;
  /** Fixed monthly rupee cap, when `mode === 'amount'`. */
  amount?: number;
  /** Percent of previous month's spend, when `mode === 'percent'`. */
  percent?: number;
  /** Uid of the member who last set the budget. */
  updatedBy: string;
  /** When the budget was last updated. */
  updatedAt: Date;
}

/** Document shape stored at `families/{familyId}/settings/budget`. */
export interface BudgetDocument {
  mode: BudgetMode;
  amount?: number;
  percent?: number;
  updatedBy: string;
  updatedAt: FirestoreTimestamp;
}

/**
 * What a {@link ScopedBudget} applies to:
 * - `category`: a monthly cap for one {@link FamilyCategory}.
 * - `subCategory`: a monthly cap for one {@link SubCategory} within a category.
 *
 * The family-wide ("global") budget is the separate {@link Budget} stored at
 * `settings/budget`; it is not a scoped budget.
 */
export type BudgetScopeType = 'category' | 'subCategory';

/**
 * A monthly budget targeted at a single category or sub-category. Stored under
 * `families/{familyId}/budgets/{id}` where the document id encodes the scope
 * (`cat_{categoryId}` or `sub_{subCategoryId}`) so a scope has at most one
 * budget. Shares {@link BudgetMode} semantics with the global {@link Budget}:
 * in `percent` mode the cap is a percentage of that scope's PREVIOUS-month
 * spend.
 */
export interface ScopedBudget {
  /** Stable document id encoding the scope (e.g. `cat_<id>`, `sub_<id>`). */
  id: string;
  scopeType: BudgetScopeType;
  /**
   * The targeted id: a {@link FamilyCategory} id when `scopeType` is
   * `category`, or a {@link SubCategory} id when `scopeType` is `subCategory`.
   */
  scopeId: string;
  /** For a `subCategory` budget, the parent {@link FamilyCategory} id. */
  parentCategoryId?: string;
  mode: BudgetMode;
  /** Fixed monthly rupee cap, when `mode === 'amount'`. */
  amount?: number;
  /** Percent of the scope's previous-month spend, when `mode === 'percent'`. */
  percent?: number;
  /** Uid of the member who last set this scoped budget. */
  updatedBy: string;
  /** When this scoped budget was last updated. */
  updatedAt: Date;
}

/** Document shape stored at `families/{familyId}/budgets/{id}`. */
export interface ScopedBudgetDocument {
  scopeType: BudgetScopeType;
  scopeId: string;
  parentCategoryId?: string;
  mode: BudgetMode;
  amount?: number;
  percent?: number;
  updatedBy: string;
  updatedAt: FirestoreTimestamp;
}

/** Document shape stored at `families/{familyId}/subSources/{subSourceId}`. */
export interface SubSourceDocument {
  source: string;
  nickname: string;
  last4?: string;
}

/**
 * How often a {@link RecurringRule} generates an Expense. Fixed enumeration.
 */
export type RecurringFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'bimonthly'
  | 'quarterly'
  | 'half-yearly'
  | 'yearly';

/** All valid {@link RecurringFrequency} values, useful for selects. */
export const RECURRING_FREQUENCIES: readonly RecurringFrequency[] = [
  'daily',
  'weekly',
  'monthly',
  'bimonthly',
  'quarterly',
  'half-yearly',
  'yearly',
] as const;

/**
 * A recurring-payment rule. Defines a template Expense and a schedule; the app
 * auto-materializes due Expenses from it when a member opens the app (there is
 * no server scheduler). Stored under
 * `families/{familyId}/recurringRules/{ruleId}`.
 */
export interface RecurringRule {
  id: string;
  /** Template amount (same constraints as an Expense amount). */
  amount: number;
  /** Family Category id the generated Expense is filed under. */
  categoryId: string;
  /** Funding method of the generated Expense. */
  source: Source;
  /** Optional SubSource id of the generated Expense. */
  subSourceId?: string;
  /** Template description copied onto each generated Expense. */
  description: string;
  /** How often an occurrence is due. */
  frequency: RecurringFrequency;
  /** First date an occurrence is due (local calendar date). */
  startDate: Date;
  /**
   * The last occurrence date already materialized into an Expense, or null when
   * none has been generated yet. Advanced as occurrences are created so
   * generation is idempotent and catches up missed periods.
   */
  lastRunDate: Date | null;
  /** Whether the rule is active (paused rules generate nothing). */
  active: boolean;
  /** Uid of the member who created the rule. */
  createdBy: string;
  /** Creation timestamp. */
  createdAt: Date;
}

/** Validated recurring-rule input ready to persist (no id/audit fields). */
export interface RecurringRuleInput {
  amount: number;
  categoryId: string;
  source: Source;
  subSourceId?: string;
  description: string;
  frequency: RecurringFrequency;
  startDate: Date;
}

/**
 * Document shape stored at `families/{familyId}/recurringRules/{ruleId}`.
 */
export interface RecurringRuleDocument {
  amount: number;
  categoryId: string;
  source: string;
  subSourceId?: string;
  description: string;
  frequency: string;
  startDate: FirestoreTimestamp;
  lastRunDate?: FirestoreTimestamp | null;
  active: boolean;
  createdBy: string;
  createdAt: FirestoreTimestamp;
}

/**
 * Routing document stored at `users/{uid}`; maps a user to their family and
 * powers the family-scoped security-rules membership check.
 */
export interface UserDocument {
  familyId: string;
}

/**
 * Optional invite-code index document stored at `inviteCodes/{code}`; maps a
 * known invite code to its family id for least-privilege join-by-code lookups.
 * See design "Decision: invite-code lookup".
 */
export interface InviteCodeDocument {
  familyId: string;
}

/**
 * An authenticated user belonging to a family group. `familyId` is resolved
 * separately via the `users/{uid}` routing document.
 * The display label resolves as `displayName ?? email ?? 'Signed in'`.
 */
export interface FamilyMember {
  uid: string;
  displayName: string | null;
  email: string | null;
  /**
   * URL of the member's profile photo (e.g. their Google account photo), or
   * null when none is available. Used to render member avatars.
   */
  photoURL?: string | null;
}

/**
 * A per-Family Member_Profile, stored under `families/{familyId}/members/{uid}`.
 * Gives the member list a readable name for every member of the Family rather
 * than only a uid (Req 2.7, 2.9).
 */
export interface MemberProfile {
  /** Matches the document id and the member's auth uid. */
  uid: string;
  /** Member's display name when available (Req 2.7). */
  displayName: string | null;
  /** Fallback identity when no display name is available (Req 2.7, 2.9). */
  email: string | null;
  /** Profile photo URL (e.g. Google account photo), or null when none. */
  photoURL: string | null;
  /** First time the profile was written (create/join). */
  joinedAt: Date;
  /** Last upsert time, refreshed on each sign-in (Req 2.8). */
  updatedAt: Date;
}

/**
 * Document shape stored at `families/{familyId}/members/{uid}` (the document id
 * is the member's uid). See design "Firestore representation".
 */
export interface MemberProfileDocument {
  /** Member's display name when available (Req 2.7). */
  displayName: string | null;
  /** Fallback identity when no display name is available (Req 2.7, 2.9). */
  email: string | null;
  /** Profile photo URL (e.g. Google account photo), or null/absent when none. */
  photoURL?: string | null;
  /** serverTimestamp() on first write. */
  joinedAt: FirestoreTimestamp;
  /** serverTimestamp() on each upsert (Req 2.8). */
  updatedAt: FirestoreTimestamp;
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
 * Legacy MVP document shape from the top-level `expenses` collection, with
 * `category`/`source` stored as strings. Consumed by migration logic.
 * See design "Migration model".
 */
export interface LegacyExpenseDocument {
  id: string;
  amount: number;
  /** Legacy category string -> mapped to a family {@link FamilyCategory}. */
  category: string;
  /** Legacy source string -> mapped to a {@link Source}. */
  source: string;
  date: FirestoreTimestamp;
  description: string;
  recordedBy: string;
  createdAt: FirestoreTimestamp;
}

/**
 * A pure, inspectable plan produced by migration logic when the first family
 * is created. The plan is idempotent: re-running over already-migrated input
 * is a no-op. See design "Migration model" (Req 10.1–10.5).
 */
export interface MigrationPlan {
  /** Categories missing in the family that must be created first (Req 10.2). */
  categoriesToCreate: { name: string }[];
  /**
   * Family-scoped expense writes, each keyed by the original legacy id for
   * idempotence (Req 10.1). Amount/date/description/recordedBy/createdAt are
   * preserved unchanged (Req 10.4).
   */
  expenseWrites: {
    legacyId: string;
    familyExpense: ExpenseInput & { recordedBy: string; createdAt: Date };
  }[];
  /** Unmappable legacy expenses left untouched, with a reason (Req 10.5). */
  failures: MigrationFailure[];
}

/**
 * A single legacy expense that could not be migrated into the first family,
 * identified by its original id with a human-readable reason. Surfaced to the
 * UI as a non-fatal migration-failure indication (Req 10.5).
 */
export interface MigrationFailure {
  /** The original (legacy) expense document id that was left unchanged. */
  legacyId: string;
  /** Why the expense could not be mapped/migrated. */
  reason: string;
}

/**
 * Reason a category or sub-source delete was blocked: it is still referenced by
 * one or more Expenses in the Family. Discriminated by `kind`. The `count` is
 * the exact number of referencing Expenses, surfaced in the in-use message
 * (Req 4.9, 5.10). See design "In-use reference counting".
 */
export interface InUseError {
  kind: 'in-use';
  /** Number of expenses referencing the category/sub-source (Req 4.9, 5.10). */
  count: number;
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
