/**
 * Create-or-join Family screen (Req 2.1, 2.2, 2.3, 2.4).
 *
 * `CreateJoinFamily` is shown to an authenticated Family_Member who does not
 * yet belong to any Family (the `'no-family'` status surfaced by
 * {@link useFamily}). It presents the two membership actions side by side
 * (Req 2.1):
 *
 * - Create a new family — an optional family-name field plus a "Create family"
 *   button that calls `createFamily(name || undefined)`, generating a unique
 *   invite code and adding the creator as a member (Req 2.2);
 * - Join an existing family — an invite-code field plus a "Join" button that
 *   calls `joinFamily(code)` (Req 2.3).
 *
 * On a successful create or join, {@link useFamily} transitions to `'ready'`;
 * routing (handled elsewhere) then moves the member onward, so this screen does
 * not navigate itself and simply renders nothing once `status === 'ready'`.
 *
 * When a join is attempted with an invite code that matches no family,
 * `joinFamily` rejects with {@link InvalidInviteCodeError}; the screen catches
 * that specific error and shows an inline, accessible invalid-code message
 * (Req 2.4). The success path shows no error.
 *
 * Both actions disable their inputs/button and show a pending label while a
 * request is in flight.
 */
import { useState } from 'react';

import { InvalidInviteCodeError } from '../data/familyRepository';
import { useFamily } from '../state/FamilyProvider';

/** Message shown when a submitted invite code matches no family (Req 2.4). */
const INVALID_INVITE_CODE_MESSAGE =
  "That invite code didn't match any family.";

/**
 * Render the create-or-join Family screen.
 */
export function CreateJoinFamily(): JSX.Element | null {
  const { status, createFamily, joinFamily } = useFamily();

  const [familyName, setFamilyName] = useState('');
  const [inviteCode, setInviteCode] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isJoining, setIsJoining] = useState(false);
  const [invalidCode, setInvalidCode] = useState(false);

  // A family has been created/joined: routing moves the member onward, so this
  // screen renders nothing (Req 2.2, 2.3).
  if (status === 'ready') {
    return null;
  }

  const isBusy = isCreating || isJoining;

  const handleCreate = async () => {
    if (isBusy) {
      return;
    }
    setInvalidCode(false);
    setIsCreating(true);
    try {
      const trimmed = familyName.trim();
      await createFamily(trimmed || undefined);
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoin = async () => {
    if (isBusy) {
      return;
    }
    setInvalidCode(false);
    setIsJoining(true);
    try {
      await joinFamily(inviteCode);
    } catch (error) {
      // Only an unknown invite code produces the inline invalid-code message
      // (Req 2.4); other errors are left to propagate to error handling.
      if (error instanceof InvalidInviteCodeError) {
        setInvalidCode(true);
      } else {
        throw error;
      }
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <main className="min-h-screen flex flex-col items-center gap-8 p-6 bg-surface-container-lowest">
      <div className="text-center mt-6 max-w-2xl">
        <h1 className="text-headline-lg font-bold text-on-surface">
          Set up your family
        </h1>
        <p className="text-on-surface-variant text-body-md mt-3">
          Create a new family to start tracking expenses, or join an existing
          one with an invite code.
        </p>
      </div>

      <div className="grid w-full max-w-4xl gap-grid_gap md:grid-cols-2">
        <section
          className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
          aria-labelledby="create-family-heading"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary-container text-2xl" aria-hidden="true">
              group_add
            </span>
            <h2 id="create-family-heading" className="text-headline-md font-semibold text-on-surface">
              Create a new family
            </h2>
          </div>
          <label className="flex flex-col gap-1.5 text-left text-sm text-on-surface-variant">
            Family name (optional)
            <input
              type="text"
              value={familyName}
              onChange={(event) => setFamilyName(event.target.value)}
              disabled={isBusy}
              className="ghost-input px-3 py-2.5 text-body-md"
              autoComplete="off"
            />
          </label>
          <button
            type="button"
            onClick={() => void handleCreate()}
            disabled={isBusy}
            aria-busy={isCreating}
            className="btn-primary px-5 py-3 mt-auto"
          >
            {isCreating ? 'Creating…' : 'Create family'}
          </button>
        </section>

        <section
          className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
          aria-labelledby="join-family-heading"
        >
          <div className="flex items-center gap-3">
            <span className="material-symbols-outlined text-primary-container text-2xl" aria-hidden="true">
              key
            </span>
            <h2 id="join-family-heading" className="text-headline-md font-semibold text-on-surface">
              Join an existing family
            </h2>
          </div>
          <label className="flex flex-col gap-1.5 text-left text-sm text-on-surface-variant">
            Invite code
            <input
              type="text"
              value={inviteCode}
              onChange={(event) => {
                setInviteCode(event.target.value);
                // Clear a stale invalid-code message as the member edits.
                if (invalidCode) {
                  setInvalidCode(false);
                }
              }}
              disabled={isBusy}
              className="ghost-input px-3 py-2.5 text-body-md font-mono tracking-widest"
              autoComplete="off"
              aria-invalid={invalidCode}
            />
          </label>
          {invalidCode && (
            <p role="alert" className="text-error text-sm">
              {INVALID_INVITE_CODE_MESSAGE}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleJoin()}
            disabled={isBusy || inviteCode.trim() === ''}
            aria-busy={isJoining}
            className="btn-primary px-5 py-3 mt-auto"
          >
            {isJoining ? 'Joining…' : 'Join'}
          </button>
        </section>
      </div>
    </main>
  );
}
