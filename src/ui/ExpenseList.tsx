/**
 * Expense list screen (Req 3.1–3.9).
 *
 * `ExpenseList` renders the family group's recorded expenses, retrieved live
 * via {@link useExpenses}. The hook subscribes to the Firestore real-time
 * listener while a Session is active, returns the data already ordered by
 * Expense date most-recent first (Req 3.4), and surfaces loading/ready/error
 * status with a `retry` control.
 *
 * Behavior by status:
 *
 * - `loading` — show a loading indicator until retrieval completes or fails
 *   (Req 3.7).
 * - `ready` with expenses — render the ordered list; each row shows the
 *   monetary amount, Category name, Source name, Expense date, and description
 *   text, leaving the description blank when empty (Req 3.1, 3.2, 3.3, 3.4).
 *   New expenses stored during the Session appear without a manual reload
 *   because the hook stays subscribed (Req 3.5).
 * - `ready` with no expenses — show an empty-state message (Req 3.6).
 * - `error` — show an error message plus a retry control that re-attempts the
 *   retrieval via `retry()`; any previously displayed data is retained by the
 *   hook (Req 3.8, 3.9).
 *
 * Styling is intentionally minimal/inline for the MVP.
 */
import { useExpenses } from '../state/useExpenses';
import type { Expense } from '../domain/types';

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

const listStyle: React.CSSProperties = {
  listStyle: 'none',
  margin: 0,
  padding: 0,
  display: 'flex',
  flexDirection: 'column',
  gap: '0.5rem',
};

const rowStyle: React.CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  alignItems: 'baseline',
  gap: '0.5rem 1rem',
  padding: '0.75rem 1rem',
  border: '1px solid #ddd',
  borderRadius: '4px',
};

const amountStyle: React.CSSProperties = {
  fontWeight: 600,
  minWidth: '6rem',
};

const metaStyle: React.CSSProperties = {
  color: '#444',
};

const dateStyle: React.CSSProperties = {
  color: '#666',
  marginLeft: 'auto',
};

const descriptionStyle: React.CSSProperties = {
  flexBasis: '100%',
  color: '#333',
};

const errorStyle: React.CSSProperties = {
  color: '#b00020',
};

const containerStyle: React.CSSProperties = {
  padding: '1rem',
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
};

/** Props for {@link ExpenseRow}. */
interface ExpenseRowProps {
  expense: Expense;
}

/**
 * Render a single expense as a list row showing amount, Category, Source,
 * date, and description (blank when empty).
 */
function ExpenseRow({ expense }: ExpenseRowProps): JSX.Element {
  const { amount, category, source, date, description } = expense;

  return (
    <li data-testid="expense-row" style={rowStyle}>
      <span data-testid="expense-amount" style={amountStyle}>
        {formatAmount(amount)}
      </span>
      <span data-testid="expense-category" style={metaStyle}>
        {category}
      </span>
      <span data-testid="expense-source" style={metaStyle}>
        {source}
      </span>
      <span data-testid="expense-date" style={dateStyle}>
        {formatDate(date)}
      </span>
      {/*
        Description is shown when present and left blank when empty (Req 3.3).
        The element is always rendered so the row layout is stable; its text
        content is the empty string for descriptionless expenses.
      */}
      <span data-testid="expense-description" style={descriptionStyle}>
        {description}
      </span>
    </li>
  );
}

/**
 * Render the recorded-expense list with loading, empty, and error states.
 *
 * @param familyId - The active family's id, forwarded to {@link useExpenses}.
 *   Defaults to `null` until the `FamilyProvider`/routing wiring lands
 *   (tasks 28.4/31), at which point the active family id is passed in.
 * @param active - Whether a Session is active; forwarded to {@link useExpenses}.
 *   Defaults to `true` (the hook's own default), matching the guarded route
 *   where this screen is only mounted within an active Session.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9
 */
export function ExpenseList({
  familyId = null,
  active = true,
}: { familyId?: string | null; active?: boolean } = {}): JSX.Element {
  // SHIM (tasks 28.4/31): `familyId` defaults to `null` so the hook stays idle
  // until `useFamily` supplies the active family id.
  const { expenses, status, retry } = useExpenses(familyId, active);

  return (
    <section data-screen="expenses" aria-label="Recorded expenses" style={containerStyle}>
      <h1>Expenses</h1>

      {/* Loading indicator while the list is being retrieved (Req 3.7). */}
      {status === 'loading' && (
        <p role="status" aria-live="polite" data-testid="expense-loading">
          Loading expenses…
        </p>
      )}

      {/*
        Read-error message + retry control (Req 3.8, 3.9). Previously displayed
        expenses are retained by the hook and still rendered below.
      */}
      {status === 'error' && (
        <div role="alert" style={errorStyle}>
          <p data-testid="expense-error">{LOAD_ERROR_MESSAGE}</p>
          <button type="button" onClick={retry} data-testid="expense-retry">
            Retry
          </button>
        </div>
      )}

      {/* Empty state once a successful read returns no expenses (Req 3.6). */}
      {status === 'ready' && expenses.length === 0 && (
        <p data-testid="expense-empty">{EMPTY_STATE_MESSAGE}</p>
      )}

      {/* Ordered expense list (Req 3.1, 3.2, 3.4). */}
      {expenses.length > 0 && (
        <ul style={listStyle}>
          {expenses.map((expense) => (
            <ExpenseRow key={expense.id} expense={expense} />
          ))}
        </ul>
      )}
    </section>
  );
}
