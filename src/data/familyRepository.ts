/**
 * Firestore adapter for families, membership, the user->family routing
 * document, and the invite-code index.
 *
 * This is the only place (alongside `authService` and `expenseRepository`) that
 * imports the Firestore SDK. It implements the design's `FamilyRepository`
 * contract: creating a family with a unique invite code, seeding default
 * categories, triggering one-time legacy migration, joining by invite code,
 * resolving the caller's family, and listing members.
 *
 * Collection layout (see design "Firestore Collection Layout"):
 *   users/{uid}                                   -> { familyId }
 *   families/{familyId}                           -> { name, inviteCode, createdAt, memberUids[] }
 *   families/{familyId}/categories/{categoryId}   -> { name }
 *   families/{familyId}/expenses/{expenseId}      -> ExpenseDocument
 *   inviteCodes/{code}                            -> { familyId }
 */
import {
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  writeBatch,
  type DocumentData,
  type QueryDocumentSnapshot,
} from 'firebase/firestore';

import { DEFAULT_CATEGORY_SET, normalizeCategoryName } from '../domain/category';
import { generateInviteCode, normalizeInviteCode } from '../domain/inviteCode';
import { isExpenseMigrated, planMigration } from '../domain/migration';
import type {
  Family,
  FamilyCategory,
  FamilyDocument,
  FamilyMember,
  LegacyExpenseDocument,
  MigrationFailure,
} from '../domain/types';
import { firestore } from './firebase';

/** Top-level collection holding the user->family routing documents. */
const USERS_COLLECTION = 'users';
/** Top-level collection holding family documents. */
const FAMILIES_COLLECTION = 'families';
/** Top-level collection holding the invite-code index documents. */
const INVITE_CODES_COLLECTION = 'inviteCodes';
/** Family-scoped subcollection holding category documents. */
const CATEGORIES_SUBCOLLECTION = 'categories';
/** Family-scoped subcollection holding expense documents. */
const EXPENSES_SUBCOLLECTION = 'expenses';
/** Legacy top-level expenses collection migrated on first-family creation. */
const LEGACY_EXPENSES_COLLECTION = 'expenses';

/** Maximum number of invite-code generation attempts on collision. */
const MAX_INVITE_CODE_ATTEMPTS = 5;

/**
 * Thrown/rejected when a join is attempted with an invite code that does not
 * match any family (Req 2.4). Callers (the state layer) can branch on this
 * type to show the "invalid invite code" message.
 */
export class InvalidInviteCodeError extends Error {
  constructor(code: string) {
    super(`No family matches invite code "${code}".`);
    this.name = 'InvalidInviteCodeError';
  }
}

/**
 * Internal sentinel used to retry the create-family transaction when a freshly
 * generated invite code collides with an existing one.
 */
class InviteCodeCollisionError extends Error {
  constructor() {
    super('Invite code collision');
    this.name = 'InviteCodeCollisionError';
  }
}

/**
 * Outcome of {@link FamilyRepository.createFamily}: the created family plus any
 * legacy expenses that could not be migrated into it.
 *
 * Migration runs once, on first-family creation, and is non-fatal: a family is
 * always created even if some legacy expenses cannot be mapped. The
 * `migrationFailures` list lets the state/UI layers surface a non-fatal
 * migration-failure indication identifying the affected expenses (Req 10.5).
 */
export interface CreateFamilyResult {
  /** The newly created family. */
  family: Family;
  /**
   * Legacy expenses left unchanged because they could not be migrated, each
   * identified by its original id with a reason. Empty when nothing failed (or
   * when there were no legacy expenses to migrate).
   */
  migrationFailures: MigrationFailure[];
}

/**
 * Data-layer contract for families, membership, and the routing document.
 * Mirrors the design's `FamilyRepository` interface.
 */
export interface FamilyRepository {
  /**
   * Create a family with a generated unique invite code, seed default
   * categories, add the creator to `memberUids`, set `users/{uid}.familyId`,
   * and (first family only, best-effort) migrate the creator's legacy
   * top-level expenses.
   *
   * Resolves with the created family and any legacy expenses that could not be
   * migrated (Req 10.5); migration never aborts family creation.
   *
   * Validates: Requirements 2.2, 4.1, 10.1, 10.5
   */
  createFamily(creator: FamilyMember, name?: string): Promise<CreateFamilyResult>;

  /**
   * Resolve a family by invite code and join the caller, appending them to
   * `memberUids` and setting `users/{uid}.familyId`. Rejects with
   * {@link InvalidInviteCodeError} when no family matches.
   *
   * Validates: Requirements 2.3, 2.4
   */
  joinFamilyByInviteCode(code: string, member: FamilyMember): Promise<Family>;

  /**
   * Return the caller's family via `users/{uid}.familyId`, or `null` when the
   * caller belongs to no family.
   *
   * Validates: Requirements 1.11, 2.5
   */
  getFamilyForMember(uid: string): Promise<Family | null>;

  /**
   * List the members of a family for the settings/members screen.
   *
   * Validates: Requirements 2.6
   */
  listMembers(familyId: string): Promise<FamilyMember[]>;
}

/** Adapt an SDK `Timestamp` (or null) to a `Date`, defaulting to now. */
function timestampToDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  // serverTimestamp() writes may not be materialized in an immediate read;
  // fall back to the current time so the returned object is still usable.
  return new Date();
}

/** Adapt an SDK `Timestamp` to the domain's structural timestamp shape. */
function toStructuralTimestamp(
  value: unknown,
): { seconds: number; nanoseconds: number } {
  if (value instanceof Timestamp) {
    return { seconds: value.seconds, nanoseconds: value.nanoseconds };
  }
  return { seconds: 0, nanoseconds: 0 };
}

/** Build a {@link Family} from a family document id and its stored data. */
function toFamily(id: string, data: FamilyDocument | DocumentData): Family {
  return {
    id,
    name: (data.name ?? null) as string | null,
    inviteCode: data.inviteCode as string,
    createdAt: timestampToDate(data.createdAt),
    memberUids: (data.memberUids ?? []) as string[],
  };
}

/**
 * Seed a family's `categories` subcollection with {@link DEFAULT_CATEGORY_SET}
 * (Req 4.1). Returns the created categories (with their generated ids) so the
 * caller can use them as the "existing categories" input to migration.
 */
async function seedDefaultCategories(familyId: string): Promise<FamilyCategory[]> {
  const categoriesRef = collection(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    CATEGORIES_SUBCOLLECTION,
  );
  const batch = writeBatch(firestore);
  const seeded: FamilyCategory[] = [];
  for (const name of DEFAULT_CATEGORY_SET) {
    const ref = doc(categoriesRef);
    batch.set(ref, { name });
    seeded.push({ id: ref.id, name });
  }
  await batch.commit();
  return seeded;
}

/**
 * Read ALL legacy top-level expenses for migration into the first family.
 *
 * Per the product decision, every pre-existing expense — regardless of which
 * member recorded it — belongs to the family and is migrated in (Req 10.1).
 * Best-effort: failures are non-fatal to family creation and surface an empty
 * list. The transitional security rule permits an authenticated user to read
 * the legacy top-level `expenses` collection so this one-time migration can
 * run.
 */
async function readAllLegacyExpenses(): Promise<LegacyExpenseDocument[]> {
  const snapshot = await getDocs(
    collection(firestore, LEGACY_EXPENSES_COLLECTION),
  );
  return snapshot.docs.map((snap: QueryDocumentSnapshot<DocumentData>) => {
    const data = snap.data();
    return {
      id: snap.id,
      amount: data.amount,
      category: data.category,
      source: data.source,
      date: toStructuralTimestamp(data.date),
      description: data.description ?? '',
      recordedBy: data.recordedBy,
      createdAt: toStructuralTimestamp(data.createdAt),
    } satisfies LegacyExpenseDocument;
  });
}

/**
 * Migrate the creator's legacy expenses into the newly created family.
 *
 * Best-effort and idempotent (Req 10.1): each legacy expense is written under
 * its original id so a retried/partial migration never duplicates, and ids
 * already present are skipped. Category strings are resolved to family
 * category ids via the seeded + newly created categories (Req 10.2). Original
 * amount/date/description/recordedBy/createdAt are preserved unchanged
 * (Req 10.4). Unmappable expenses and per-expense write errors are surfaced via
 * the returned failure list rather than thrown (Req 10.5); the whole routine is
 * wrapped by the caller so migration never aborts family creation.
 */
async function migrateLegacyExpenses(
  familyId: string,
  seededCategories: FamilyCategory[],
): Promise<MigrationFailure[]> {
  const legacy = await readAllLegacyExpenses();
  if (legacy.length === 0) {
    return [];
  }

  const plan = planMigration(legacy, seededCategories);
  const failures: MigrationFailure[] = [...plan.failures];

  // Create categories the plan says are missing, accumulating a
  // normalized-name -> id map seeded with the existing family categories.
  const categoriesRef = collection(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    CATEGORIES_SUBCOLLECTION,
  );
  const idByNormName = new Map<string, string>();
  for (const category of seededCategories) {
    idByNormName.set(normalizeCategoryName(category.name), category.id);
  }
  for (const { name } of plan.categoriesToCreate) {
    const norm = normalizeCategoryName(name);
    if (idByNormName.has(norm)) {
      continue;
    }
    const ref = doc(categoriesRef);
    await setDoc(ref, { name });
    idByNormName.set(norm, ref.id);
  }

  // Track which legacy ids are already present so re-runs are no-ops.
  const expensesRef = collection(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    EXPENSES_SUBCOLLECTION,
  );
  const alreadyMigrated = new Set<string>();

  for (const { legacyId, familyExpense } of plan.expenseWrites) {
    try {
      const targetRef = doc(expensesRef, legacyId);
      // Idempotence guard: skip ids already written (Req 10.1).
      const existing = await getDoc(targetRef);
      if (existing.exists() || isExpenseMigrated(legacyId, alreadyMigrated)) {
        continue;
      }

      // The plan's `categoryId` holds the resolved category NAME; map it to the
      // real Firestore id created above (see migration.ts contract).
      const categoryId = idByNormName.get(
        normalizeCategoryName(familyExpense.categoryId ?? familyExpense.category),
      );
      if (categoryId === undefined) {
        failures.push({
          legacyId,
          reason: `Could not resolve category id for "${familyExpense.categoryId ?? familyExpense.category}".`,
        });
        continue;
      }

      await setDoc(targetRef, {
        amount: familyExpense.amount,
        category: familyExpense.category,
        categoryId,
        source: familyExpense.source,
        date: Timestamp.fromDate(familyExpense.date),
        description: familyExpense.description,
        recordedBy: familyExpense.recordedBy,
        createdAt: Timestamp.fromDate(familyExpense.createdAt),
      });
      alreadyMigrated.add(legacyId);
    } catch (error) {
      // Leave the legacy doc untouched and record the failure (Req 10.5).
      failures.push({
        legacyId,
        reason: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return failures;
}

/**
 * Live {@link FamilyRepository} backed by the initialized Firestore instance.
 */
export const familyRepository: FamilyRepository = {
  async createFamily(
    creator: FamilyMember,
    name?: string,
  ): Promise<CreateFamilyResult> {
    const familyRef = doc(collection(firestore, FAMILIES_COLLECTION));
    const userRef = doc(firestore, USERS_COLLECTION, creator.uid);

    // Generate a unique invite code, retrying on collision a bounded number of
    // times. The transaction verifies inviteCodes/{code} does not already exist
    // and atomically writes the family, the invite-code index, and the user's
    // routing document so the creator is a member from the moment the family
    // exists (required by the security rules' family-create check).
    let inviteCode = '';
    let created = false;
    for (let attempt = 0; attempt < MAX_INVITE_CODE_ATTEMPTS; attempt++) {
      const candidate = generateInviteCode(() => Math.random());
      const inviteCodeRef = doc(firestore, INVITE_CODES_COLLECTION, candidate);
      try {
        await runTransaction(firestore, async (tx) => {
          const existing = await tx.get(inviteCodeRef);
          if (existing.exists()) {
            throw new InviteCodeCollisionError();
          }
          tx.set(familyRef, {
            name: name ?? null,
            inviteCode: candidate,
            createdAt: serverTimestamp(),
            memberUids: [creator.uid],
          });
          tx.set(inviteCodeRef, { familyId: familyRef.id });
          tx.set(userRef, { familyId: familyRef.id });
        });
        inviteCode = candidate;
        created = true;
        break;
      } catch (error) {
        if (error instanceof InviteCodeCollisionError) {
          continue;
        }
        throw error;
      }
    }

    if (!created) {
      throw new Error(
        `Failed to generate a unique invite code after ${MAX_INVITE_CODE_ATTEMPTS} attempts.`,
      );
    }

    // Seed default categories (Req 4.1), then run best-effort, idempotent
    // migration of legacy expenses (Req 10.1). Neither aborts family creation.
    const seededCategories = await seedDefaultCategories(familyRef.id);
    let migrationFailures: MigrationFailure[] = [];
    try {
      migrationFailures = await migrateLegacyExpenses(
        familyRef.id,
        seededCategories,
      );
      if (migrationFailures.length > 0) {
        // Surface migration failures without losing the family (Req 10.5).
        console.warn(
          `Family ${familyRef.id} created, but ${migrationFailures.length} legacy expense(s) could not be migrated:`,
          migrationFailures,
        );
      }
    } catch (error) {
      // Migration is non-fatal to family creation (Req 10.5). A wholesale
      // migration failure (e.g. the legacy read was denied) is surfaced as a
      // single failure entry so the UI can still indicate something went wrong.
      console.warn(
        `Family ${familyRef.id} created, but legacy expense migration failed:`,
        error,
      );
      migrationFailures = [
        {
          legacyId: '*',
          reason: error instanceof Error ? error.message : String(error),
        },
      ];
    }

    // Read the family back to return a materialized createdAt timestamp.
    const familySnap = await getDoc(familyRef);
    const data = familySnap.data();
    const family =
      data !== undefined
        ? toFamily(familyRef.id, data)
        : {
            id: familyRef.id,
            name: name ?? null,
            inviteCode,
            createdAt: new Date(),
            memberUids: [creator.uid],
          };
    return { family, migrationFailures };
  },

  async joinFamilyByInviteCode(
    code: string,
    member: FamilyMember,
  ): Promise<Family> {
    const normalizedCode = normalizeInviteCode(code);
    const inviteCodeRef = doc(
      firestore,
      INVITE_CODES_COLLECTION,
      normalizedCode,
    );
    const inviteSnap = await getDoc(inviteCodeRef);
    if (!inviteSnap.exists()) {
      throw new InvalidInviteCodeError(normalizedCode);
    }

    const familyId = inviteSnap.data().familyId as string;
    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);
    const userRef = doc(firestore, USERS_COLLECTION, member.uid);

    const family = await runTransaction(firestore, async (tx) => {
      const familySnap = await tx.get(familyRef);
      if (!familySnap.exists()) {
        // Index points at a missing family; treat as an invalid code.
        throw new InvalidInviteCodeError(normalizedCode);
      }
      tx.update(familyRef, { memberUids: arrayUnion(member.uid) });
      tx.set(userRef, { familyId });

      const data = familySnap.data();
      const memberUids = new Set<string>(
        (data.memberUids ?? []) as string[],
      );
      memberUids.add(member.uid);
      return toFamily(familyId, { ...data, memberUids: [...memberUids] });
    });

    return family;
  },

  async getFamilyForMember(uid: string): Promise<Family | null> {
    const userRef = doc(firestore, USERS_COLLECTION, uid);
    const userSnap = await getDoc(userRef);
    if (!userSnap.exists()) {
      return null;
    }
    const familyId = userSnap.data().familyId as string | undefined;
    if (familyId === undefined || familyId === '') {
      return null;
    }

    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      return null;
    }
    return toFamily(familyId, familySnap.data());
  },

  async listMembers(familyId: string): Promise<FamilyMember[]> {
    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      return [];
    }
    const memberUids = (familySnap.data().memberUids ?? []) as string[];
    // LIMITATION: the app stores no user-profile collection of display
    // names/emails beyond Firebase Auth, and a member can only read their own
    // auth identity. So members are returned with their uid only and
    // displayName/email null. This is acceptable for the MVP member list
    // (Req 2.6); the UI can highlight the current member using the auth state.
    return memberUids.map((uid) => ({
      uid,
      displayName: null,
      email: null,
    }));
  },
};
