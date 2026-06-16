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
 *    and lists the family's members (Req 2.6). `listMembers` now returns
 *    profile-backed members carrying each member's real `displayName`/`email`,
 *    so member labels are resolved directly with {@link resolveMemberLabel}
 *    (display name → email → fallback); the screen only falls back to the
 *    member uid when neither a name nor an email is stored (Req 2.9).
 * 2. {@link CategoryManager} — lists the family's categories and adds new ones
 *    with empty/duplicate validation (Req 4.2, 4.3, 4.4, 4.5).
 * 3. {@link SubSourceManager} — adds a sub-source under a chosen {@link Source}
 *    with a required nickname and optional last-4 validation, and lists the
 *    existing sub-sources grouped by source (Req 5.1, 5.2, 5.3, 5.5). Full card
 *    numbers are never stored (Req 5.6).
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

/**
 * Build the in-use message shown when a category/sub-source delete is blocked
 * because Expenses still reference it, pluralizing "expense" correctly
 * (Req 4.9, 5.10).
 */
function inUseMessage(count: number): string {
  return `In use by ${count} expense${count === 1 ? '' : 's'}.`;
}

/** Shared classes for ghost form controls. */
const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md';

/** Shared classes for a labelled form field column. */
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

/**
 * Render the family settings screen.
 *
 * Renders a loading/error/no-family fallback while {@link useFamily} resolves;
 * once a family is `ready` it shows the family, category, and sub-source
 * sections.
 */
export function FamilySettings(): JSX.Element {
  const { family, members, status, ownerUid, isOwner, removeMember } = useFamily();
  // Pass the resolved family id (or null) into the data hooks; they stay idle
  // until a family is resolved.
  const familyId = family?.id ?? null;

  if (status === 'loading') {
    return (
      <main className="p-5 md:px-container_padding md:py-8 max-w-3xl mx-auto">
        <p role="status" className="text-on-surface-variant">
          Loading family…
        </p>
      </main>
    );
  }

  if (status === 'error') {
    return (
      <main className="p-5 md:px-container_padding md:py-8 max-w-3xl mx-auto">
        <p role="alert" className="text-error">
          Your family could not be loaded.
        </p>
      </main>
    );
  }

  if (status === 'no-family' || family === null) {
    return (
      <main className="p-5 md:px-container_padding md:py-8 max-w-3xl mx-auto">
        <p className="text-on-surface-variant">You don't belong to a family yet.</p>
      </main>
    );
  }

  return (
    <main className="p-5 md:px-container_padding md:py-8 max-w-3xl mx-auto flex flex-col gap-grid_gap">
      <h1 className="text-headline-lg font-bold text-on-surface">Family settings</h1>
      <FamilySection
        inviteCode={family.inviteCode}
        members={members}
        ownerUid={ownerUid}
        isOwner={isOwner}
        onRemoveMember={removeMember}
      />
      <CategoryManager familyId={familyId} />
      <SubSourceManager familyId={familyId} />
    </main>
  );
}

/** Props for {@link FamilySection}. */
interface FamilySectionProps {
  inviteCode: string;
  members: FamilyMember[];
  /** Uid of the family's owner, or null when unknown (Req 12.1). */
  ownerUid: string | null;
  /** Whether the current member is the owner (gates the remove control). */
  isOwner: boolean;
  /** Remove a member from the family (owner-only, Req 12.3). */
  onRemoveMember: (uid: string) => Promise<void>;
}

/**
 * Family identity section: the shareable invite code (with copy-to-clipboard)
 * and the member list (Req 2.6). The owner's row is labeled "Owner"; when the
 * current member is the owner, each other member row gets a remove control
 * with an inline confirmation (Req 12.3, 12.5, 12.7).
 */
function FamilySection({
  inviteCode,
  members,
  ownerUid,
  isOwner,
  onRemoveMember,
}: FamilySectionProps): JSX.Element {
  const [copied, setCopied] = useState(false);
  // Uid of the member awaiting remove confirmation (inline confirm state).
  const [confirmingUid, setConfirmingUid] = useState<string | null>(null);
  // Uid of the member whose removal is in flight.
  const [removingUid, setRemovingUid] = useState<string | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);

  const handleRemove = async (uid: string) => {
    if (removingUid !== null) {
      return;
    }
    setConfirmingUid(null);
    setRemovingUid(uid);
    setRemoveError(null);
    try {
      await onRemoveMember(uid);
    } catch {
      setRemoveError('Could not remove that member. Please try again.');
    } finally {
      setRemovingUid(null);
    }
  };

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
    <section
      className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      aria-labelledby="family-heading"
    >
      <h2 id="family-heading" className="text-headline-md font-semibold text-on-surface">
        Your family
      </h2>

      <div className="flex flex-col gap-3">
        <span className="text-sm text-on-surface-variant">
          Share this invite code so others can join:
        </span>
        <div className="flex flex-wrap gap-3 items-center">
          <span
            data-testid="invite-code"
            className="font-mono text-2xl tracking-[0.2em] px-4 py-2 rounded-lg text-primary-container bg-primary-container/10 border border-primary-container/30"
          >
            {inviteCode}
          </span>
          <button
            type="button"
            onClick={() => void handleCopy()}
            className="btn-ghost px-4 py-2 text-sm flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              content_copy
            </span>
            Copy
          </button>
        </div>
        {copied && (
          <p role="status" className="text-primary-container text-sm">
            Invite code copied.
          </p>
        )}
      </div>

      <div className="flex flex-col gap-2">
        <h3 className="text-label-caps uppercase text-on-surface-variant">Members</h3>
        {members.length === 0 ? (
          <p className="text-on-surface-variant">No members to show.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {members.map((member) => {
              // listMembers now returns profile-backed members with real
              // displayName/email, so resolve the label directly (Req 2.9).
              // Only fall back to the uid when neither a name nor an email is
              // stored (resolveMemberLabel returns "Signed in" in that case).
              const hasIdentity =
                member.displayName !== null || member.email !== null;
              const display = hasIdentity
                ? resolveMemberLabel(member)
                : member.uid;
              const isMemberOwner = ownerUid !== null && member.uid === ownerUid;
              // The remove control is shown only to the owner, and never on the
              // owner's own row (Req 12.5, 12.7).
              const canRemove = isOwner && !isMemberOwner;
              const isConfirming = confirmingUid === member.uid;
              const isRemoving = removingUid === member.uid;
              return (
                <li
                  key={member.uid}
                  className="flex items-center gap-3 px-3 py-2 rounded-lg bg-surface-container-high/30 border border-outline-variant/20"
                >
                  <span className="material-symbols-outlined text-primary-container text-lg" aria-hidden="true">
                    account_circle
                  </span>
                  <span className="text-on-surface text-sm truncate flex-1">{display}</span>
                  {isMemberOwner && (
                    <span className="text-xs uppercase tracking-wide text-primary-container px-2 py-0.5 rounded-full bg-primary-container/10 border border-primary-container/30">
                      Owner
                    </span>
                  )}
                  {canRemove &&
                    (isConfirming ? (
                      <span className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => void handleRemove(member.uid)}
                          disabled={isRemoving}
                          aria-busy={isRemoving}
                          className="btn-ghost px-2.5 py-1 text-xs text-error"
                        >
                          {isRemoving ? 'Removing…' : 'Remove'}
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmingUid(null)}
                          disabled={isRemoving}
                          className="btn-ghost px-2.5 py-1 text-xs"
                        >
                          Cancel
                        </button>
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmingUid(member.uid)}
                        disabled={removingUid !== null}
                        aria-label={`Remove member ${display}`}
                        className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                      >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">
                          person_remove
                        </span>
                      </button>
                    ))}
                </li>
              );
            })}
          </ul>
        )}
        {removeError && (
          <p role="alert" className="text-error text-sm mt-1">
            {removeError}
          </p>
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
  const { categories, status, addCategory, deleteCategory } = useCategories(familyId);

  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Id of the category awaiting delete confirmation (inline confirm state).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Id of the category whose delete is in flight.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Per-category in-use message keyed by category id (Req 4.9).
  const [inUseById, setInUseById] = useState<Record<string, string>>({});

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

  const handleDelete = async (categoryId: string) => {
    if (deletingId !== null) {
      return;
    }
    setConfirmingId(null);
    setDeletingId(categoryId);
    // Clear any stale in-use message for this item before re-checking.
    setInUseById((prev) => {
      const next = { ...prev };
      delete next[categoryId];
      return next;
    });
    try {
      const result = await deleteCategory(categoryId);
      if (!result.ok) {
        // Blocked: still referenced by expenses. Surface the count inline and
        // leave the item in place (Req 4.9).
        setInUseById((prev) => ({
          ...prev,
          [categoryId]: inUseMessage(result.error.count),
        }));
      }
      // On success the live subscription removes the item (Req 4.7); nothing
      // further to do here.
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      aria-labelledby="categories-heading"
    >
      <h2 id="categories-heading" className="text-headline-md font-semibold text-on-surface">
        Categories
      </h2>

      {status === 'loading' ? (
        <p role="status" className="text-on-surface-variant">
          Loading categories…
        </p>
      ) : (
        <>
          {status === 'error' && (
            <p role="alert" className="text-error">
              Categories could not be loaded.
            </p>
          )}
          {categories.length === 0 ? (
            <p className="text-on-surface-variant">No categories yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {categories.map((category) => {
                const inUse = inUseById[category.id];
                const isConfirming = confirmingId === category.id;
                const isDeleting = deletingId === category.id;
                return (
                  <li
                    key={category.id}
                    className="flex flex-col gap-1.5 px-3 py-2 rounded-lg text-sm text-on-surface bg-surface-container-high/40 border border-outline-variant/20"
                  >
                    <div className="flex items-center gap-3">
                      <span className="flex-1 truncate">{category.name}</span>
                      {isConfirming ? (
                        <span className="flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => void handleDelete(category.id)}
                            disabled={isDeleting}
                            aria-busy={isDeleting}
                            className="btn-ghost px-2.5 py-1 text-xs text-error"
                          >
                            {isDeleting ? 'Deleting…' : 'Confirm'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmingId(null)}
                            disabled={isDeleting}
                            className="btn-ghost px-2.5 py-1 text-xs"
                          >
                            Cancel
                          </button>
                        </span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setInUseById((prev) => {
                              const next = { ...prev };
                              delete next[category.id];
                              return next;
                            });
                            setConfirmingId(category.id);
                          }}
                          disabled={deletingId !== null}
                          aria-label={`Delete category ${category.name}`}
                          className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                        >
                          <span className="material-symbols-outlined text-lg" aria-hidden="true">
                            delete
                          </span>
                        </button>
                      )}
                    </div>
                    {inUse && (
                      <p role="alert" className="text-error text-xs">
                        {inUse}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}

      <div className="flex flex-wrap gap-3 items-end">
        <label className={`${FIELD_CLASS} flex-1 min-w-[12rem]`}>
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
            className={CONTROL_CLASS}
            autoComplete="off"
            aria-invalid={error !== null}
          />
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          className="btn-primary px-4 py-2.5"
        >
          {isAdding ? 'Adding…' : 'Add category'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-error text-sm">
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" className="text-primary-container text-sm">
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
  const { status, addSubSource, forSource, deleteSubSource } = useSubSources(familyId);

  const [source, setSource] = useState<Source>(SOURCES[0]);
  const [nickname, setNickname] = useState('');
  const [last4, setLast4] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  // Id of the sub-source awaiting delete confirmation (inline confirm state).
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  // Id of the sub-source whose delete is in flight.
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Per-sub-source in-use message keyed by sub-source id (Req 5.10).
  const [inUseById, setInUseById] = useState<Record<string, string>>({});

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

  const handleDelete = async (subSourceId: string) => {
    if (deletingId !== null) {
      return;
    }
    setConfirmingId(null);
    setDeletingId(subSourceId);
    // Clear any stale in-use message for this item before re-checking.
    setInUseById((prev) => {
      const next = { ...prev };
      delete next[subSourceId];
      return next;
    });
    try {
      const result = await deleteSubSource(subSourceId);
      if (!result.ok) {
        // Blocked: still referenced by expenses. Surface the count inline and
        // leave the item in place (Req 5.10).
        setInUseById((prev) => ({
          ...prev,
          [subSourceId]: inUseMessage(result.error.count),
        }));
      }
      // On success the live subscription removes the item (Req 5.9).
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      aria-labelledby="subsources-heading"
    >
      <h2 id="subsources-heading" className="text-headline-md font-semibold text-on-surface">
        Payment sub-sources
      </h2>
      <p className="text-sm text-on-surface-variant">
        Store a nickname and, optionally, the last 4 digits only. Full card
        numbers are never stored.
      </p>

      <div className="flex flex-wrap gap-3 items-end">
        <label className={FIELD_CLASS}>
          Source
          <select
            value={source}
            onChange={(event) => setSource(event.target.value as Source)}
            disabled={isAdding}
            className={CONTROL_CLASS}
          >
            {SOURCES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>
        <label className={`${FIELD_CLASS} flex-1 min-w-[10rem]`}>
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
            className={CONTROL_CLASS}
            autoComplete="off"
            aria-invalid={error !== null}
          />
        </label>
        <label className={FIELD_CLASS}>
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
            className={`${CONTROL_CLASS} w-28`}
            autoComplete="off"
          />
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          className="btn-primary px-4 py-2.5"
        >
          {isAdding ? 'Adding…' : 'Add sub-source'}
        </button>
      </div>

      {error && (
        <p role="alert" className="text-error text-sm">
          {error}
        </p>
      )}
      {confirmation && (
        <p role="status" className="text-primary-container text-sm">
          {confirmation}
        </p>
      )}

      <div className="flex flex-col gap-3">
        <h3 className="text-label-caps uppercase text-on-surface-variant">
          Existing sub-sources
        </h3>
        {status === 'loading' ? (
          <p role="status" className="text-on-surface-variant">
            Loading sub-sources…
          </p>
        ) : status === 'error' ? (
          <p role="alert" className="text-error">
            Sub-sources could not be loaded.
          </p>
        ) : (
          SOURCES.map((option) => {
            const items = forSource(option);
            if (items.length === 0) {
              return null;
            }
            return (
              <div key={option} className="flex flex-col gap-1.5">
                <h4 className="text-sm font-semibold text-on-surface">{option}</h4>
                <ul className="flex flex-col gap-1">
                  {items.map((subSource) => {
                    const inUse = inUseById[subSource.id];
                    const isConfirming = confirmingId === subSource.id;
                    const isDeleting = deletingId === subSource.id;
                    return (
                      <li
                        key={subSource.id}
                        className="flex flex-col gap-1.5 text-sm text-on-surface-variant px-3 py-1.5 rounded-lg bg-surface-container-high/30 border border-outline-variant/20"
                      >
                        <div className="flex items-center gap-3">
                          <span className="flex-1 truncate">
                            {subSource.nickname}
                            {subSource.last4 ? ` ••${subSource.last4}` : ''}
                          </span>
                          {isConfirming ? (
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                onClick={() => void handleDelete(subSource.id)}
                                disabled={isDeleting}
                                aria-busy={isDeleting}
                                className="btn-ghost px-2.5 py-1 text-xs text-error"
                              >
                                {isDeleting ? 'Deleting…' : 'Confirm'}
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmingId(null)}
                                disabled={isDeleting}
                                className="btn-ghost px-2.5 py-1 text-xs"
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => {
                                setInUseById((prev) => {
                                  const next = { ...prev };
                                  delete next[subSource.id];
                                  return next;
                                });
                                setConfirmingId(subSource.id);
                              }}
                              disabled={deletingId !== null}
                              aria-label={`Delete sub-source ${subSource.nickname}`}
                              className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                            >
                              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                                delete
                              </span>
                            </button>
                          )}
                        </div>
                        {inUse && (
                          <p role="alert" className="text-error text-xs">
                            {inUse}
                          </p>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
