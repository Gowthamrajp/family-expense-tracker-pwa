/**
 * State-layer family provider.
 *
 * `FamilyProvider` mediates between the UI and the {@link FamilyRepository}
 * data adapter. After authentication it resolves the signed-in member's family
 * via `getFamilyForMember(uid)` and derives a membership `status` that drives
 * routing: an authenticated member with no family is `'no-family'`, which the
 * `RequireFamily` wrapper redirects to the create-or-join screen (Req 1.11,
 * 2.7).
 *
 * It also owns the two membership actions:
 *
 * - `createFamily(name?)` creates a family with a unique invite code and adds
 *   the creator as a member (Req 2.2);
 * - `joinFamily(inviteCode)` joins an existing family by invite code (Req 2.3),
 *   rejecting with {@link InvalidInviteCodeError} when the code matches no
 *   family so the create-or-join screen can show an invalid-code message
 *   (Req 2.4).
 *
 * The resolved family exposes its `inviteCode` and the family's `members` for
 * the settings/members screen (Req 2.6).
 *
 * It consumes {@link useAuth}: family resolution runs when auth becomes
 * `authenticated`, and the resolved family/members are cleared when the Session
 * ends (observed via the auth `member` becoming `null` and the monotonic
 * `sessionEpoch`). The underlying {@link FamilyRepository} is injectable so the
 * provider can be unit-tested with a fake repository.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import {
  familyRepository as defaultFamilyRepository,
  type FamilyRepository,
} from '../data/familyRepository';
import type { Family, FamilyMember, MigrationFailure } from '../domain/types';
import { useAuth } from './AuthProvider';

/**
 * Lifecycle status of the current member's family membership.
 *
 * - `loading`: auth is resolving, or the member's family is being resolved.
 * - `no-family`: an authenticated member who belongs to no family. Drives the
 *   `RequireFamily` redirect to the create-or-join screen (Req 1.11, 2.7).
 * - `ready`: a family has been resolved (or just created/joined).
 * - `error`: resolving the member's family failed (Req 9.1).
 */
export type FamilyStatus = 'loading' | 'no-family' | 'ready' | 'error';

/** Value exposed by {@link FamilyContext} to consumers via {@link useFamily}. */
export interface UseFamilyResult {
  /** The resolved family, or `null` while loading / when none exists. */
  family: Family | null;
  /** Members of the resolved family for the settings/members screen (Req 2.6). */
  members: FamilyMember[];
  /** Derived membership status. */
  status: FamilyStatus;
  /**
   * Legacy expenses that could not be migrated when this member created the
   * first family (Req 10.5). Empty unless a just-completed `createFamily`
   * reported failures; the create-or-join screen surfaces a non-fatal notice
   * when non-empty. Cleared via {@link dismissMigrationFailures}.
   */
  migrationFailures: MigrationFailure[];
  /** Dismiss the migration-failure notice surfaced after create (Req 10.5). */
  dismissMigrationFailures: () => void;
  /**
   * Create a new family, generate a unique invite code, and add the current
   * member; on success the provider transitions to `ready` (Req 2.2).
   *
   * @throws when no member is signed in, or when creation fails.
   */
  createFamily: (name?: string) => Promise<void>;
  /**
   * Join an existing family by invite code; on success the provider transitions
   * to `ready` (Req 2.3).
   *
   * @throws {@link InvalidInviteCodeError} when the code matches no family so
   *   the create-or-join screen can show an invalid-code message (Req 2.4); also
   *   throws when no member is signed in.
   */
  joinFamily: (inviteCode: string) => Promise<void>;
}

const FamilyContext = createContext<UseFamilyResult | null>(null);

/** Props for {@link FamilyProvider}. */
export interface FamilyProviderProps {
  children: ReactNode;
  /** Family adapter to use; defaults to the shared {@link familyRepository}. */
  familyRepository?: FamilyRepository;
}

/**
 * Provide family membership state and actions to descendants.
 *
 * @see useFamily for consuming the provided value.
 */
export function FamilyProvider({
  children,
  familyRepository = defaultFamilyRepository,
}: FamilyProviderProps): JSX.Element {
  const { member, status: authStatus, sessionEpoch } = useAuth();

  const [family, setFamily] = useState<Family | null>(null);
  const [members, setMembers] = useState<FamilyMember[]>([]);
  const [status, setStatus] = useState<FamilyStatus>('loading');
  // Migration failures reported by the most recent createFamily (Req 10.5).
  const [migrationFailures, setMigrationFailures] = useState<MigrationFailure[]>(
    [],
  );

  // Identifies the in-flight resolution/action so a result that arrives after
  // the Session changed (or a newer action started) is ignored. Bumped on every
  // sessionEpoch change and at the start of each create/join action.
  const resolutionRef = useRef(0);

  // Best-effort, non-blocking upsert of the current member's Member_Profile
  // after a family is resolved. Stores the profile when a member first
  // creates/joins (Req 2.7) and backfills members who joined before profiles
  // existed, since it runs on every family resolution (Req 2.8). Targets only
  // the caller's own members/{uid} document, so it is always permitted. A
  // failure is logged and swallowed so it never blocks reaching the ready
  // state.
  const upsertCurrentMemberProfile = useCallback(
    async (familyId: string, currentMember: FamilyMember): Promise<void> => {
      try {
        await familyRepository.upsertMemberProfile(familyId, currentMember);
      } catch (error) {
        console.warn(
          `Failed to upsert member profile for ${currentMember.uid} in family ${familyId}:`,
          error,
        );
      }
    },
    [familyRepository],
  );

  // Resolve the current member's family once auth settles. Re-runs whenever the
  // signed-in member changes or a Session ends (sessionEpoch increments).
  useEffect(() => {
    const resolutionId = resolutionRef.current + 1;
    resolutionRef.current = resolutionId;

    // No active Session (loading, unauthenticated, error, or signed out): clear
    // any family/members held for a previous Session and report loading.
    if (authStatus !== 'authenticated' || member === null) {
      setFamily(null);
      setMembers([]);
      setMigrationFailures([]);
      setStatus('loading');
      return;
    }

    const uid = member.uid;
    setStatus('loading');

    void (async () => {
      try {
        const resolved = await familyRepository.getFamilyForMember(uid);
        // Superseded by a newer resolution (Session changed): ignore.
        if (resolutionRef.current !== resolutionId) {
          return;
        }
        if (resolved === null) {
          setFamily(null);
          setMembers([]);
          setStatus('no-family');
          return;
        }
        // Upsert the current member's profile (best-effort, non-blocking) so it
        // is stored on first create/join and backfilled on every resolution
        // (Req 2.7, 2.8), then populate members from the profile-backed list.
        await upsertCurrentMemberProfile(resolved.id, member);
        if (resolutionRef.current !== resolutionId) {
          return;
        }
        const familyMembers = await familyRepository.listMembers(resolved.id);
        if (resolutionRef.current !== resolutionId) {
          return;
        }
        setFamily(resolved);
        setMembers(familyMembers);
        setStatus('ready');
      } catch {
        if (resolutionRef.current !== resolutionId) {
          return;
        }
        // Family resolution read failed: surface an error so the UI can offer
        // retry (Req 9.1).
        setFamily(null);
        setMembers([]);
        setStatus('error');
      }
    })();
  }, [familyRepository, member, authStatus, sessionEpoch, upsertCurrentMemberProfile]);

  const createFamily = useCallback(
    async (name?: string): Promise<void> => {
      if (member === null) {
        throw new Error('Cannot create a family without an authenticated member.');
      }
      // Invalidate any in-flight resolution so its late result is ignored.
      const resolutionId = resolutionRef.current + 1;
      resolutionRef.current = resolutionId;

      const created = await familyRepository.createFamily(member, name);
      // Upsert the creator's profile (best-effort, non-blocking) before listing
      // members so the member list shows a real name (Req 2.7).
      await upsertCurrentMemberProfile(created.family.id, member);
      const familyMembers = await familyRepository.listMembers(created.family.id);
      // A Session change during the create supersedes this result.
      if (resolutionRef.current !== resolutionId) {
        return;
      }
      setFamily(created.family);
      setMembers(familyMembers);
      // Surface any legacy expenses that could not be migrated (Req 10.5).
      setMigrationFailures(created.migrationFailures);
      setStatus('ready');
    },
    [familyRepository, member, upsertCurrentMemberProfile],
  );

  const joinFamily = useCallback(
    async (inviteCode: string): Promise<void> => {
      if (member === null) {
        throw new Error('Cannot join a family without an authenticated member.');
      }
      const resolutionId = resolutionRef.current + 1;
      resolutionRef.current = resolutionId;

      // Rejects with InvalidInviteCodeError on an unknown code; the caller
      // (create-or-join screen) catches it to show an invalid-code message
      // (Req 2.4). We deliberately let it propagate without changing status.
      const joined = await familyRepository.joinFamilyByInviteCode(
        inviteCode,
        member,
      );
      // Upsert the joining member's profile (best-effort, non-blocking) before
      // listing members so the member list shows a real name (Req 2.7).
      await upsertCurrentMemberProfile(joined.id, member);
      const familyMembers = await familyRepository.listMembers(joined.id);
      if (resolutionRef.current !== resolutionId) {
        return;
      }
      setFamily(joined);
      setMembers(familyMembers);
      setStatus('ready');
    },
    [familyRepository, member, upsertCurrentMemberProfile],
  );

  const dismissMigrationFailures = useCallback((): void => {
    setMigrationFailures([]);
  }, []);

  const value = useMemo<UseFamilyResult>(
    () => ({
      family,
      members,
      status,
      migrationFailures,
      dismissMigrationFailures,
      createFamily,
      joinFamily,
    }),
    [
      family,
      members,
      status,
      migrationFailures,
      dismissMigrationFailures,
      createFamily,
      joinFamily,
    ],
  );

  return (
    <FamilyContext.Provider value={value}>{children}</FamilyContext.Provider>
  );
}

/**
 * Access the current {@link UseFamilyResult}.
 *
 * @throws Error when called outside of a {@link FamilyProvider}.
 */
export function useFamily(): UseFamilyResult {
  const value = useContext(FamilyContext);
  if (value === null) {
    throw new Error('useFamily must be used within a FamilyProvider');
  }
  return value;
}
