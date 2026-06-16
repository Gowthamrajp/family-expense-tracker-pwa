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
  arrayRemove,
  arrayUnion,
  collection,
  doc,
  getDoc,
  getDocs,
  runTransaction,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
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
  MemberProfileDocument,
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
/** Family-scoped subcollection holding member-profile documents. */
const MEMBERS_SUBCOLLECTION = 'members';
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
   * Reads the `families/{familyId}/members` subcollection (Member_Profile
   * documents) so each returned member carries their real `displayName`/
   * `email` (Req 2.9). When a profile document is missing for a uid present in
   * the family's `memberUids` (a member who has not yet been backfilled), that
   * member is still returned with `displayName`/`email` null so the row remains
   * present and the UI can fall back to a uid label.
   *
   * Validates: Requirements 2.6, 2.9
   */
  listMembers(familyId: string): Promise<FamilyMember[]>;

  /**
   * Upsert the caller's own Member_Profile under
   * `families/{familyId}/members/{uid}`. Writes `displayName`, `email`, a
   * `joinedAt` server timestamp on first write (preserved on later upserts via
   * merge), and an `updatedAt` server timestamp on every upsert. Called when a
   * member creates/joins a family and on every sign-in/family-resolution so
   * members who joined before profiles existed are backfilled (Req 2.7, 2.8).
   *
   * Targets only the caller's own document, which is the only member document
   * the security rules permit them to write.
   *
   * Validates: Requirements 2.7, 2.8
   */
  upsertMemberProfile(familyId: string, member: FamilyMember): Promise<void>;

  /**
   * Remove another member from the family. Owner-gated by the security rules
   * (only the family's `ownerUid` may update membership — Req 12.3, 12.4). The
   * repository additionally refuses to remove the owner themselves (Req 12.5).
   * Uses `arrayRemove` on `memberUids`. The removed member's `users/{uid}`
   * routing doc is intentionally NOT cleared (it is self-only); the resilient
   * `getFamilyForMember` handles their now-denied access (Req 12.6).
   *
   * Validates: Requirements 12.3, 12.5
   */
  removeMember(familyId: string, targetUid: string): Promise<void>;

  /**
   * One-time owner backfill for legacy families (Req 12.2). Writes
   * `ownerUid = uid` only when the family currently has no owner and the caller
   * is the original creator (the first uid in `memberUids`); otherwise a no-op.
   * Best-effort and non-blocking, like {@link upsertMemberProfile}.
   *
   * Validates: Requirements 12.2
   */
  claimOwnershipIfUnset(familyId: string, uid: string): Promise<void>;
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
  const memberUids = (data.memberUids ?? []) as string[];
  return {
    id,
    name: (data.name ?? null) as string | null,
    inviteCode: data.inviteCode as string,
    createdAt: timestampToDate(data.createdAt),
    memberUids,
    // Legacy families have no ownerUid yet; default to '' so the type stays a
    // string. It is backfilled to memberUids[0] on resolution (Req 12.2).
    ownerUid: (data.ownerUid ?? '') as string,
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
            // The creator is the family's owner (Req 12.1).
            ownerUid: creator.uid,
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
            ownerUid: creator.uid,
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

    // IMPORTANT: do NOT read the family document before joining. The family
    // read rule (`allow read: if isMember(familyId)`) denies reads to a caller
    // who is not yet a member, so reading first (e.g. inside the transaction)
    // fails with permission-denied for every new joiner and leaves them stuck
    // on the create/join screen. Instead, perform writes only — which the
    // rules DO allow because the caller ends up in `memberUids` and writes
    // their own routing doc — then read the family afterward, once the caller
    // is a member.
    //
    // A writes-only transaction keeps the two writes atomic. `tx.update`
    // requires the family to exist; a stale invite index pointing at a missing
    // family throws not-found, which we surface as an invalid code (Req 2.4).
    try {
      await runTransaction(firestore, async (tx) => {
        tx.update(familyRef, { memberUids: arrayUnion(member.uid) });
        tx.set(userRef, { familyId });
      });
    } catch (error) {
      const code = (error as { code?: string } | null)?.code;
      if (code === 'not-found') {
        // The invite index referenced a family that no longer exists.
        throw new InvalidInviteCodeError(normalizedCode);
      }
      throw error;
    }

    // The caller is now a member, so this read passes the member-only rule.
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      throw new InvalidInviteCodeError(normalizedCode);
    }
    return toFamily(familyId, familySnap.data());
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
    try {
      const familySnap = await getDoc(familyRef);
      if (!familySnap.exists()) {
        return null;
      }
      return toFamily(familyId, familySnap.data());
    } catch (error) {
      // A removed member's routing doc still points at the family, but the
      // member-gated read rule now denies them. Treat permission-denied as
      // "no family" so they are routed to the create/join screen rather than an
      // error screen (Req 12.6).
      const code = (error as { code?: string } | null)?.code;
      if (code === 'permission-denied') {
        return null;
      }
      throw error;
    }
  },

  async listMembers(familyId: string): Promise<FamilyMember[]> {
    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      return [];
    }
    const memberUids = (familySnap.data().memberUids ?? []) as string[];

    // Read the members subcollection (Member_Profile documents) so members
    // carry their real displayName/email (Req 2.9).
    const membersRef = collection(
      firestore,
      FAMILIES_COLLECTION,
      familyId,
      MEMBERS_SUBCOLLECTION,
    );
    const membersSnap = await getDocs(membersRef);
    const profileByUid = new Map<string, MemberProfileDocument>();
    for (const snap of membersSnap.docs) {
      profileByUid.set(snap.id, snap.data() as MemberProfileDocument);
    }

    // Return one member per uid in memberUids, preferring profile identity and
    // falling back to a null-identity member when no profile exists yet so the
    // row remains present for the UI (Req 2.9).
    return memberUids.map((uid) => {
      const profile = profileByUid.get(uid);
      return {
        uid,
        displayName: profile?.displayName ?? null,
        email: profile?.email ?? null,
      };
    });
  },

  async upsertMemberProfile(
    familyId: string,
    member: FamilyMember,
  ): Promise<void> {
    const memberRef = doc(
      firestore,
      FAMILIES_COLLECTION,
      familyId,
      MEMBERS_SUBCOLLECTION,
      member.uid,
    );
    // Merge so a previously stored joinedAt is preserved across upserts; only
    // set joinedAt when the document does not yet exist (first write, Req 2.7).
    const existing = await getDoc(memberRef);
    const profile: Record<string, unknown> = {
      displayName: member.displayName ?? null,
      email: member.email ?? null,
      updatedAt: serverTimestamp(),
    };
    if (!existing.exists()) {
      profile.joinedAt = serverTimestamp();
    }
    await setDoc(memberRef, profile, { merge: true });
  },

  async removeMember(familyId: string, targetUid: string): Promise<void> {
    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);

    // Guard: never remove the family's owner (Req 12.5). Read the family to
    // learn the owner; the caller is the owner (the only one the rules let
    // update membership), so this read is permitted.
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      return;
    }
    const ownerUid = (familySnap.data().ownerUid ?? '') as string;
    if (targetUid === ownerUid) {
      throw new Error('The family owner cannot be removed.');
    }

    await updateDoc(familyRef, { memberUids: arrayRemove(targetUid) });
  },

  async claimOwnershipIfUnset(familyId: string, uid: string): Promise<void> {
    const familyRef = doc(firestore, FAMILIES_COLLECTION, familyId);
    const familySnap = await getDoc(familyRef);
    if (!familySnap.exists()) {
      return;
    }
    const data = familySnap.data();
    const ownerUid = (data.ownerUid ?? '') as string;
    const memberUids = (data.memberUids ?? []) as string[];
    // Only the original creator (memberUids[0]) backfills, and only when no
    // owner is recorded yet (Req 12.2).
    if (ownerUid === '' && memberUids.length > 0 && memberUids[0] === uid) {
      await updateDoc(familyRef, { ownerUid: uid });
    }
  },
};
