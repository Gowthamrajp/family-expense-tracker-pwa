/**
 * Family settings screen (Req 2.6, 4.2, 4.3, 4.4, 4.5, 5.1, 5.2, 5.3, 5.5).
 *
 * `FamilySettings` is the per-family management screen shown to a member who
 * belongs to a Family. It resolves the active family and its members via
 * {@link useFamily} and threads `family?.id ?? null` into {@link useCategories}
 * and {@link useSubSources} (which stay idle until a family is resolved).
 *
 * It renders three sections:
 *
 * 1. Family — displays the family's shareable invite code prominently with a
 *    copy-to-clipboard control (using `navigator.clipboard` when available),
 *    and lists the family's members (Req 2.6). Member labels are resolved with
 *    {@link resolveMemberLabel}; because the repository currently cannot
 *    hydrate `displayName`/`email` for other members, that helper falls back to
 *    the literal "Signed in", so this screen additionally falls back to the
 *    member uid to keep rows distinguishable.
 * 2. {@link CategoryManager} — lists the family's categories and adds new ones
 *    with empty/duplicate validation (Req 4.2, 4.3, 4.4, 4.5).
 * 3. {@link SubSourceManager} — adds a sub-source under a chosen {@link Source}
 *    with a required nickname and optional last-4 validation, and lists the
 *    existing sub-sources grouped by source (Req 5.1, 5.2, 5.3, 5.5). Full card
 *    numbers are never stored (Req 5.6).
 *
 * Styling is intentionally minimal/inline, consistent with the other MVP
 * screens (see {@link CreateJoinFamily} / {@link SignIn}).
 */
import { useState } from 'react';

import { resolveMemberLabel } from '../domain/member';
import { SOURCES, type FamilyMember, type Source } from '../domain/types';
import { useCategories } from '../state/useCategories';
import { useFamily } from '../state/FamilyProvider';
import { useSubSources } from '../state/useSubSources';

const CATEGORY_REQUIRED_MESSAGE = 'Enter a category name.';
const CATEGORY_DUPLICATE_MESSAGE = 'That category already exists.';
const SUBSOURCE_NICKNAME_REQUIRED_MESSAGE = 'Enter a nickname.';
const SUBSOURCE_INVALID_LAST4_MESSAGE = 'Last 4 digits must be exactly 4 digits.';

const containerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '2rem',
  padding: '1.5rem',
  maxWidth: '36rem',
  margin: '0 auto',
};

const sectionStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.75rem',
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
  padding: '0.5rem 1rem',
  fontSize: '1rem',
  cursor: 'pointer',
};

const inlineFormStyle: React.CSSProperties = {
  display: 'flex',
  gap: '0.5rem',
  flexWrap: 'wrap',
  alignItems: 'flex-end',
};

const errorStyle: React.CSSProperties = {
  color: '#b00020',
};

const successStyle: React.CSSProperties = {
  color: '#0a6b3c',
};

const inviteCodeStyle: React.CSSProperties = {
  fontFamily: 'monospace',
  fontSize: '1.5rem',
  letterSpacing: '0.1em',
  padding: '0.25rem 0.5rem',
  background: '#f2f2f2',
  borderRadius: '4px',
};

const noteStyle: React.CSSProperties = {
  fontSize: '0.85rem',
  color: '#555',
};

/**
 * Render the family settings screen.
 *
 * Renders a loading/error/no-family fallback while {@link useFamily} resolves;
 * once a family is `ready` it shows the family, category, and sub-source
 * sections.
 */
export function FamilySettings(): JSX.Element {
  const { family, members, status } = useFamily();
  // Pass the resolved family id (or null) into the data hooks; they stay idle
  // until a family is resolved.
  const familyId = family?.id ?? null;

  if (status === 'loading') {
    return (
      <main style={containerStyle}>
        <p role="status">Loading family…</p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main style={containerStyle}>
        <p role="alert" style={errorStyle}>
          Your family could not be loaded.
        </p>
      </main>
    );
  }

  if (status === 'no-family' || family === null) {
    return (
      <main style={containerStyle}>
        <p>You don't belong to a family yet.</p>
      </main>
    );
  }

  return (
    <main style={containerStyle}>
      <h1>Family settings</h1>
      <FamilySection inviteCode={family.inviteCode} members={members} />
      <CategoryManager familyId={familyId} />
      <SubSourceManager familyId={familyId} />
    </main>
  );
}

/** Props for {@link FamilySection}. */
interface FamilySectionProps {
  inviteCode: string;
  members: FamilyMember[];
}

/**
 * Family identity section: the shareable invite code (with copy-to-clipboard)
 * and the member list (Req 2.6).
 */
function FamilySection({ inviteCode, members }: FamilySectionProps): JSX.Element {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    setCopied(false);
    // Use the async Clipboard API when available; otherwise the code remains
    // visible on screen for the member to copy manually.
    if (typeof navigator !== 'undefined' && navigator.clipboard) {
      try {
        await navigator.clipboard.writeText(inviteCode);
        setCopied(true);
      } catch {
        // Clipboard write was blocked/unavailable; leave the code on screen.
        setCopied(false);
      }
    }
  };

  return (
    <section style={sectionStyle} aria-labelledby="family-heading">
      <h2 id="family-heading">Your family</h2>

      <div style={sectionStyle}>
        <span>Share this invite code so others can join:</span>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <span style={inviteCodeStyle} data-testid="invite-code">
            {inviteCode}
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            style={buttonStyle}
          >
            Copy
          </button>
        </div>
        {copied && (
          <p role="status" style={successStyle}>
            Invite code copied.
          </p>
        )}
      </div>

      <div style={sectionStyle}>
        <h3>Members</h3>
        {members.length === 0 ? (
          <p>No members to show.</p>
        ) : (
          <ul>
            {members.map((member) => {
              const label = resolveMemberLabel(member);
              // The repository can't currently hydrate names/emails for other
              // members, so fall back to the uid to keep rows distinguishable.
              const display = label === 'Signed in' ? member.uid : label;
              return <li key={member.uid}>{display}</li>;
            })}
          </ul>
        )}
      </div>
    </section>
  );
}

/** Props for {@link CategoryManager}. */
interface CategoryManagerProps {
  /** Active family id, or `null` while no family is resolved. */
  familyId: string | null;
}

/**
 * Category management section (Req 4.2, 4.3, 4.4, 4.5).
 *
 * Lists the family's current categories and provides an add form. On an empty
 * name it shows "Enter a category name." (Req 4.4); on a duplicate it shows
 * "That category already exists." (Req 4.5); on success it clears the input and
 * shows a brief confirmation (Req 4.3).
 */
export function CategoryManager({ familyId }: CategoryManagerProps): JSX.Element {
  const { categories, status, addCategory } = useCategories(familyId);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (isAdding) {
      return;
    }
    setError(null);
    setConfirmation(null);
    setIsAdding(true);
    try {
      const result = await addCategory(name);
      if (result.ok) {
        setName('');
        setConfirmation(`Added "${result.value.name}".`);
      } else {
        setError(
          result.error.kind === 'duplicate'
            ? CATEGORY_DUPLICATE_MESSAGE
            : CATEGORY_REQUIRED_MESSAGE,
        );
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section style={sectionStyle} aria-labelledby="categories-heading">
      <h2 id="categories-heading">Categories</h2>

      {status === 'loading' ? (
        <p role="status">Loading categories…</p>
      ) : (
        <>
          {status === 'error' && (
            <p role="alert" style={errorStyle}>
              Categories could not be loaded.
            </p>
          )}
          {categories.length === 0 ? (
            <p>No categories yet.</p>
          ) : (
            <ul>
              {categories.map((category) => (
                <li key={category.id}>{category.name}</li>
              ))}
            </ul>
          )}
        </>
      )}

      <div style={inlineFormStyle}>
        <label style={labelStyle}>
          New category
          <input
            type="text"
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={isAdding}
            style={inputStyle}
            autoComplete="off"
            aria-invalid={error !== null}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          style={buttonStyle}
        >
          {isAdding ? 'Adding…' : 'Add category'}
        </button>
      </div>

      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" style={successStyle}>
          {confirmation}
        </p>
      )}
    </section>
  );
}

/** Props for {@link SubSourceManager}. */
interface SubSourceManagerProps {
  /** Active family id, or `null` while no family is resolved. */
  familyId: string | null;
}

/**
 * Sub-source management section (Req 5.1, 5.2, 5.3, 5.5).
 *
 * Provides a form to add a sub-source under a chosen {@link Source}, with a
 * required nickname and an optional last-4 identifier. On a missing nickname it
 * shows "Enter a nickname." (Req 5.3); on a malformed last-4 it shows "Last 4
 * digits must be exactly 4 digits." (Req 5.5). It lists existing sub-sources
 * grouped by source. Full card numbers are never stored (Req 5.6).
 */
export function SubSourceManager({ familyId }: SubSourceManagerProps): JSX.Element {
  const { status, addSubSource, forSource } = useSubSources(familyId);

  const [source, setSource] = useState<Source>(SOURCES[0]);
  const [nickname, setNickname] = useState('');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  const handleAdd = async () => {
    if (isAdding) {
      return;
    }
    setError(null);
    setConfirmation(null);
    setIsAdding(true);
    try {
      const result = await addSubSource({
        source,
        nickname,
        last4: last4 || null,
      });
      if (result.ok) {
        setNickname('');
        setLast4('');
        setConfirmation(`Added "${result.value.nickname}".`);
      } else {
        setError(
          result.error.kind === 'nickname-required'
            ? SUBSOURCE_NICKNAME_REQUIRED_MESSAGE
            : SUBSOURCE_INVALID_LAST4_MESSAGE,
        );
      }
    } finally {
      setIsAdding(false);
    }
  };

  return (
    <section style={sectionStyle} aria-labelledby="subsources-heading">
      <h2 id="subsources-heading">Payment sub-sources</h2>
      <p style={noteStyle}>
        Store a nickname and, optionally, the last 4 digits only. Full card
        numbers are never stored.
      </p>

      <div style={inlineFormStyle}>
        <label style={labelStyle}>
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as Source)}
            disabled={isAdding}
            style={inputStyle}
          >
            {SOURCES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label style={labelStyle}>
          Nickname
          <input
            type="text"
            value={nickname}
            onChange={(event) => {
              setNickname(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={isAdding}
            style={inputStyle}
            autoComplete="off"
            aria-invalid={error !== null}
          />
        </label>
        <label style={labelStyle}>
          Last 4 digits (optional)
          <input
            type="text"
            inputMode="numeric"
            maxLength={4}
            value={last4}
            onChange={(event) => {
              setLast4(event.target.value);
              if (error) {
                setError(null);
              }
            }}
            disabled={isAdding}
            style={inputStyle}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          style={buttonStyle}
        >
          {isAdding ? 'Adding…' : 'Add sub-source'}
        </button>
      </div>

      {error && (
        <p role="alert" style={errorStyle}>
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" style={successStyle}>
          {confirmation}
        </p>
      )}

      <div style={sectionStyle}>
        <h3>Existing sub-sources</h3>
        {status === 'loading' ? (
          <p role="status">Loading sub-sources…</p>
        ) : status === 'error' ? (
          <p role="alert" style={errorStyle}>
            Sub-sources could not be loaded.
          </p>
        ) : (
          SOURCES.map((option) => {
            const items = forSource(option);
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={option}>
                <h4>{option}</h4>
                <ul>
                  {items.map((subSource) => (
                    <li key={subSource.id}>
                      {subSource.nickname}
                      {subSource.last4 ? ` ••${subSource.last4}` : ''}
                    </li>
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
