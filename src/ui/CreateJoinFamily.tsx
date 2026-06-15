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

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '2rem',
  minHeight: '100vh',
  padding: '1.5rem',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
  width: '100%',
  maxWidth: '24rem',
};

const labelStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
  textAlign: 'left',
};

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  fontSize: '1rem',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  fontSize: '1rem',
  cursor: 'pointer',
};

const errorStyle: React.CSSProperties = {
  color: '#b00020',
  maxWidth: '24rem',
};

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
    <main style={containerStyle}>
      <h1>Set up your family</h1>
      <p>Create a new family to start tracking expenses, or join an existing
        one with an invite code.</p>

      <section style={sectionStyle} aria-labelledby="create-family-heading">
        <h2 id="create-family-heading">Create a new family</h2>
        <label style={labelStyle}>
          Family name (optional)
          <input
            type="text"
            value={familyName}
            onChange={(event) => setFamilyName(event.target.value)}
            disabled={isBusy}
            style={inputStyle}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleCreate()}
          disabled={isBusy}
          aria-busy={isCreating}
          style={buttonStyle}
        >
          {isCreating ? 'Creating…' : 'Create family'}
        </button>
      </section>

      <section style={sectionStyle} aria-labelledby="join-family-heading">
        <h2 id="join-family-heading">Join an existing family</h2>
        <label style={labelStyle}>
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
            style={inputStyle}
            autoComplete="off"
            aria-invalid={invalidCode}
          />
        </label>
        {invalidCode && (
          <p role="alert" style={errorStyle}>
            {INVALID_INVITE_CODE_MESSAGE}
          </p>
        )}
        <button
          type="button"
          onClick={() => void handleJoin()}
          disabled={isBusy || inviteCode.trim() === ''}
          aria-busy={isJoining}
          style={buttonStyle}
        >
          {isJoining ? 'Joining…' : 'Join'}
        </button>
      </section>
    </main>
  );
}
