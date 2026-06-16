/**
 * Expense list screen (Req 3.1–3.9, 6.1–6.3).
 *
 * `ExpenseList` renders the family group's recorded expenses, retrieved live
 * via {@link useExpenses}. The hook subscribes to the Firestore real-time
 * listener while a Session is active, returns the data already ordered by
 * Expense date most-recent first (Req 3.4, 6.1), and surfaces
 * loading/ready/error status with a `retry` control.
 *
 * Each stored expense references its Category and (optionally) SubSource by id;
 * the family's {@link useCategories} and {@link useSubSources} subscriptions
 * supply the lookup data so {@link resolveLabels} can project each expense into
 * a display-ready {@link ExpenseRow} with the resolved Category name, the
 * SubSource nickname when present, and the denormalized recording member
 * (Req 6.2, 6.3).
 *
 * Behavior by status (driven by the expense subscription):
 *
 * - `loading` — show a loading indicator until retrieval completes or fails
 *   (Req 3.7).
 * - `ready` with expenses — render the ordered list; each row shows the
 *   monetary amount, Category name, Source name, SubSource nickname when
 *   present, the recording Family_Member, Expense date, and description text,
 *   leaving the description blank when empty (Req 6.2, 6.3). New expenses
 *   stored during the Session appear without a manual reload because the hook
 *   stays subscribed (Req 3.5).
 * - `ready` with no expenses — show an empty-state message (Req 3.6).
 * - `error` — show an error message plus a retry control that re-attempts the
 *   retrieval via `retry()`; any previously displayed data is retained by the
 *   hook (Req 3.8, 3.9).
 *
 * Each row also exposes per-row Edit and Delete affordances available on every
 * row regardless of who recorded the expense (Req 3.19). Edit opens
 * {@link ExpenseEntryForm} in edit mode inside a glass-card modal/overlay,
 * seeding it with the original {@link Expense}; a successful update closes the
 * overlay via `onSaved` and the live subscription reflects the change
 * (Req 3.13). Delete uses an inline confirmation prompt and, on confirm, calls
 * `deleteExpense(expenseId)` from {@link useExpenses}; the live subscription
 * removes the row (Req 3.17, 3.18).
 */
import { useCallback, useEffect, useState } from 'react';

import { useExpenses } from '../state/useExpenses';
import { useCategories } from '../state/useCategories';
import { useSubSources } from '../state/useSubSources';
import { resolveLabels, type ExpenseRow } from '../domain/expenseMapper';
import type { Expense } from '../domain/types';
import { ExpenseEntryForm } from './ExpenseEntryForm';

/** Message shown when no expenses exist for the family group (Req 3.6). */
const EMPTY_STATE_MESSAGE = 'No expenses have been recorded yet.';

/** Message shown when the expense list could not be loaded (Req 3.8). */
const LOAD_ERROR_MESSAGE = 'Expenses could not be loaded.';

/**
 * Format a monetary amount as currency for display.
 *
 * Uses INR as the MVP's single currency (multi-currency is out of scope).
 * The `en-IN` locale renders the rupee symbol with Indian digit grouping
 * (e.g. ₹1,00,000.00).
 */
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

function formatAmount(amount: number): string {
  return currencyFormatter.format(amount);
}

/**
 * Format an Expense date readably (e.g. "Jan 5, 2025").
 */
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/**
 * Map a few common category names to Material Symbols icons; fall back to a
 * generic category icon. Purely presentational — does not affect data.
 */
const CATEGORY_ICONS: ReadonlyArray<[RegExp, string]> = [
  [/grocer|food|supermarket/i, 'shopping_basket'],
  [/dining|restaurant|eat/i, 'restaurant'],
  [/transport|fuel|gas|car|travel/i, 'directions_car'],
  [/rent|hous|mortgage|utilit/i, 'home'],
  [/health|medical|pharm/i, 'medical_services'],
  [/leisure|entertain|movie|fun/i, 'movie'],
  [/shop|cloth|retail/i, 'shopping_bag'],
  [/bill|subscription|electric|water/i, 'receipt'],
  [/educat|school|tuition/i, 'school'],
  [/wellness|fitness|gym/i, 'fitness_center'],
];

function categoryIcon(categoryName: string): string {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(categoryName)) {
      return icon;
    }
  }
  return 'category';
}

/** Props for {@link ExpenseListRow}. */
interface ExpenseListRowProps {
  /** Display-ready projection used to render the row's labels (Req 6.2, 6.3). */
  row: ExpenseRow;
  /**
   * The original stored {@link Expense}, threaded through alongside its
   * projected {@link ExpenseRow} so the Edit affordance can open the entry form
   * in edit mode with the full record (id, `categoryId`, source, `subSourceId`,
   * date, etc. — Req 3.13).
   */
  expense: Expense;
  /** Open the edit modal for this expense (Req 3.13). */
  onEdit: (expense: Expense) => void;
  /**
   * Delete this expense after confirmation (Req 3.17, 3.18). Returns the
   * delete promise so the row can show an in-flight state.
   */
  onDelete: (expenseId: string) => Promise<void>;
}

/**
 * Render a single resolved expense as a glass-card row showing a category icon
 * chip, amount, Category name, Source name, SubSource nickname (when present),
 * recording member, date, and description (blank when empty), plus per-row Edit
 * and Delete affordances.
 *
 * The Edit control opens the entry form in edit mode for the original Expense
 * (Req 3.13). The Delete control uses an inline confirmation prompt — matching
 * the dark FamilyVault styling used by the category/sub-source managers — and
 * calls back to remove the expense on confirm (Req 3.17, 3.18). Both controls
 * appear on every row regardless of who recorded the expense (Req 3.19).
 *
 * Validates: Requirements 3.13, 3.17, 3.18, 3.19, 6.2, 6.3
 */
function ExpenseListRow({
  row,
  expense,
  onEdit,
  onDelete,
}: ExpenseListRowProps): JSX.Element {
  const {
    amount,
    categoryName,
    sourceName,
    subSourceNickname,
    recordedByName,
    date,
    description,
  } = row;

  // Inline delete-confirmation state, mirroring the category/sub-source manager
  // pattern (Req 3.17). `isConfirming` swaps the trash icon for Confirm/Cancel
  // controls; `isDeleting` reflects the in-flight delete.
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      // The live subscription removes the row on success, so there is no local
      // success state to manage here (Req 3.18).
      await onDelete(expense.id);
    } finally {
      // If the delete failed the row is still present; drop the in-flight flag
      // and close the confirm prompt so the member can retry.
      setIsDeleting(false);
      setIsConfirming(false);
    }
  }, [expense.id, onDelete]);

  return (
    <li
      data-testid="expense-row"
      className="glass-card glass-card-hover p-4 flex items-center gap-4"
    >
      {/* Category icon chip. */}
      <div className="shrink-0 w-12 h-12 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
        <span className="material-symbols-outlined" aria-hidden="true">
          {categoryIcon(categoryName)}
        </span>
      </div>

      {/* Primary info: category, recorded-by, source/sub-source, description. */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span data-testid="expense-category" className="font-semibold text-on-surface">
            {categoryName}
          </span>
          <span data-testid="expense-recordedby" className="text-xs text-on-surface-variant italic">
            by {recordedByName}
          </span>
        </div>
        <div className="flex items-center gap-2 flex-wrap text-xs text-on-surface-variant mt-0.5">
          <span data-testid="expense-source">{sourceName}</span>
          {/*
            SubSource nickname is shown only when the expense references a known
            sub-source (Req 6.2). It is omitted entirely otherwise so the row is
            not cluttered with an empty field.
          */}
          {subSourceNickname !== undefined && (
            <>
              <span aria-hidden="true">•</span>
              <span data-testid="expense-subsource">{subSourceNickname}</span>
            </>
          )}
        </div>
        {/*
          Description is shown when present and left blank when empty (Req 6.3).
          The element is always rendered so the row layout is stable; its text
          content is the empty string for descriptionless expenses.
        */}
        <span
          data-testid="expense-description"
          className="block text-sm text-on-surface-variant mt-1 truncate"
        >
          {description}
        </span>
      </div>

      {/* Amount + date, right aligned. */}
      <div className="text-right shrink-0">
        <span
          data-testid="expense-amount"
          className="block font-mono-data text-lg font-semibold text-white"
        >
          {formatAmount(amount)}
        </span>
        <span data-testid="expense-date" className="block text-xs text-on-surface-variant mt-0.5">
          {formatDate(date)}
        </span>
      </div>

      {/*
        Per-row Edit/Delete affordances (Req 3.13, 3.17, 3.18, 3.19). Shown on
        every row regardless of recorder. The Delete control toggles an inline
        confirmation prompt before removing the expense.
      */}
      <div className="shrink-0 flex items-center gap-1">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
              aria-busy={isDeleting}
              data-testid="expense-delete-confirm"
              className="btn-ghost px-2.5 py-1 text-xs text-error"
            >
              {isDeleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
              data-testid="expense-delete-cancel"
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(expense)}
              aria-label={`Edit expense ${categoryName} ${formatAmount(amount)}`}
              data-testid="expense-edit"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                edit
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              aria-label={`Delete expense ${categoryName} ${formatAmount(amount)}`}
              data-testid="expense-delete"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                delete
              </span>
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Render the recorded-expense list with loading, empty, and error states.
 *
 * @param familyId - The active family's id, forwarded to {@link useExpenses},
 *   {@link useCategories}, and {@link useSubSources} so the rendered rows can
 *   resolve Category/SubSource ids to display labels. Defaults to `null` until
 *   the `FamilyProvider`/routing wiring lands (tasks 28.4/31), at which point
 *   the active family id is passed in.
 * @param active - Whether a Session is active; forwarded to {@link useExpenses}.
 *   Defaults to `true` (the hook's own default), matching the guarded route
 *   where this screen is only mounted within an active Session.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.13, 3.17, 3.18, 3.19, 6.1, 6.2, 6.3
 */
export function ExpenseList({
  familyId = null,
  active = true,
}: { familyId?: string | null; active?: boolean } = {}): JSX.Element {
  // SHIM (tasks 28.4/31): `familyId` defaults to `null` so the hooks stay idle
  // until `useFamily` supplies the active family id.
  const { expenses, status, retry, deleteExpense } = useExpenses(familyId, active);

  // Family categories and sub-sources supply the lookup data used to resolve
  // each expense's stored `categoryId`/`subSourceId` references to display
  // labels (Req 6.2, 6.3). Their own loading/error status does not gate the
  // expense list: `resolveLabels` falls back to the legacy `category` string
  // and omits the sub-source nickname when the lookup data is unavailable.
  const { categories } = useCategories(familyId);
  const { subSources } = useSubSources(familyId);

  // The expense currently open in the edit modal, or `null` when no modal is
  // shown (Req 3.13). Holds the original {@link Expense} so the entry form can
  // pre-populate from the full stored record.
  const [editing, setEditing] = useState<Expense | null>(null);

  // Close the edit modal on Escape so the overlay is keyboard-dismissible.
  useEffect(() => {
    if (editing === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing]);

  // Project each expense into a display-ready row with resolved labels, keeping
  // the original {@link Expense} alongside so the row's Edit affordance can open
  // the entry form in edit mode (Req 3.13). Kept inline (cheap, recomputed per
  // snapshot) so rows always reflect the latest expense, category, and
  // sub-source data delivered by the live subscriptions.
  const entries = expenses.map((expense) => ({
    expense,
    row: resolveLabels(expense, categories, subSources),
  }));

  return (
    <section
      data-screen="expenses"
      aria-label="Recorded expenses"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap"
    >
      <h1 className="text-headline-lg font-bold text-on-surface">Expenses</h1>

      {/* Loading indicator while the list is being retrieved (Req 3.7). */}
      {status === 'loading' && (
        <p
          role="status"
          aria-live="polite"
          data-testid="expense-loading"
          className="text-on-surface-variant"
        >
          Loading expenses…
        </p>
      )}

      {/*
        Read-error message + retry control (Req 3.8, 3.9). Previously displayed
        expenses are retained by the hook and still rendered below.
      */}
      {status === 'error' && (
        <div
          role="alert"
          className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4"
        >
          <p data-testid="expense-error" className="text-error">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={retry}
            data-testid="expense-retry"
            className="btn-ghost px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state once a successful read returns no expenses (Req 3.6). */}
      {status === 'ready' && entries.length === 0 && (
        <div className="glass-card p-card_padding flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-primary-container text-4xl" aria-hidden="true">
            receipt_long
          </span>
          <p data-testid="expense-empty" className="text-on-surface-variant text-body-lg">
            {EMPTY_STATE_MESSAGE}
          </p>
        </div>
      )}

      {/* Ordered expense list (Req 3.1, 3.2, 3.4, 6.1, 6.2, 6.3). */}
      {entries.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {entries.map(({ expense, row }) => (
            <ExpenseListRow
              key={row.id}
              row={row}
              expense={expense}
              onEdit={setEditing}
              onDelete={deleteExpense}
            />
          ))}
        </ul>
      )}

      {/*
        Edit modal/overlay (Req 3.13). Mounts {@link ExpenseEntryForm} in edit
        mode for the selected expense; `onSaved` closes the overlay on a
        successful update and the live subscription reflects the change
        (Req 6.5). Reuses the glass-card styling so the edit experience matches
        the entry screen. The overlay is a labelled dialog and dismissible via
        its backdrop, an explicit close control, or Escape.
      */}
      {editing !== null && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
          onClick={(event) => {
            // Dismiss only when the backdrop itself is clicked, not the dialog.
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit expense"
            data-testid="expense-edit-modal"
            className="relative w-full max-w-xl my-8"
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close edit form"
              data-testid="expense-edit-close"
              className="absolute right-3 top-3 z-10 btn-ghost p-1.5 text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
            <ExpenseEntryForm
              familyId={familyId}
              existingExpense={editing}
              onSaved={() => setEditing(null)}
            />
          </div>
        </div>
      )}
    </section>
  );
}
