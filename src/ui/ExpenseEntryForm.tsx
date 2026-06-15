/**
 * Expense entry screen (Req 2.1, 2.4–2.10).
 *
 * `ExpenseEntryForm` is the guarded screen that records a single Expense. It:
 *
 * - renders a controlled form with a required amount field, required Category
 *   and Source selections, an optional date field, and an optional description
 *   field accepting 0–280 characters (Req 2.1);
 * - validates the form on submit with the pure {@link validateExpenseForm}
 *   helper, surfacing per-field inline messages for an invalid amount (Req 2.4),
 *   a missing Category (Req 2.5), a missing Source (Req 2.6), and an
 *   invalid/out-of-range date (Req 2.8). An empty date defaults to today
 *   (Req 2.7). Nothing is stored while any field is invalid;
 * - on a valid submission, persists the Expense via
 *   {@link expenseRepository.addExpense} attributed to the current member from
 *   {@link useAuth}. The write is wrapped in a 10-second timeout: if it does not
 *   complete in time or rejects, a save-failed error is shown and all entered
 *   values are retained so the member can retry (Req 2.10);
 * - on success, shows a confirmation indication and clears all fields (Req 2.9).
 *
 * Styling is intentionally minimal/inline for the MVP.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { expenseRepository } from '../data/expenseRepository';
import {
  MAX_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
  MIN_AMOUNT,
  MIN_DATE,
  validateExpenseForm,
  type ExpenseFormInput,
  type FieldErrors,
} from '../domain/validation';
import { CATEGORIES, SOURCES } from '../domain/types';
import { useAuth } from '../state/AuthProvider';

/**
 * Maximum time to wait for the Data_Store write before treating the save as
 * failed and retaining the entered values (Req 2.10).
 */
export const SAVE_TIMEOUT_MS = 10_000;

/** Message shown when the save fails or does not complete in time (Req 2.10). */
const SAVE_FAILED_MESSAGE =
  'Saving the expense failed. Your entries were kept — please try again.';

/** Message shown when an expense is stored successfully (Req 2.9). */
const SAVE_SUCCESS_MESSAGE = 'Expense saved.';

/** Empty form state used for the initial render and after a successful save. */
const EMPTY_FORM: ExpenseFormInput = {
  amount: '',
  category: '',
  source: '',
  date: '',
  description: '',
};

/** Submission lifecycle, separate from per-field validation state. */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error' };

const formStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '1rem',
  maxWidth: '28rem',
  padding: '1.5rem',
};

const fieldStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'column',
  gap: '0.25rem',
};

const controlStyle: React.CSSProperties = {
  padding: '0.5rem',
  fontSize: '1rem',
};

const fieldErrorStyle: React.CSSProperties = {
  color: '#b00020',
  fontSize: '0.875rem',
};

const saveErrorStyle: React.CSSProperties = {
  color: '#b00020',
};

const successStyle: React.CSSProperties = {
  color: '#0a7c2f',
};

const counterStyle: React.CSSProperties = {
  fontSize: '0.875rem',
  color: '#555',
};

const buttonStyle: React.CSSProperties = {
  padding: '0.75rem 1.25rem',
  fontSize: '1rem',
  cursor: 'pointer',
  alignSelf: 'flex-start',
};

/**
 * Human-readable message for an amount validation failure (Req 2.4). All
 * variants describe the same required format/range so the member can correct
 * the value.
 */
function amountErrorMessage(error: NonNullable<FieldErrors['amount']>): string {
  switch (error.kind) {
    case 'required':
      return 'Enter an amount.';
    case 'not-numeric':
      return 'Enter a numeric amount.';
    case 'too-small':
      return `Enter an amount of at least ${MIN_AMOUNT.toFixed(2)}.`;
    case 'too-large':
      return `Enter an amount no greater than ${MAX_AMOUNT.toFixed(2)}.`;
    case 'too-many-decimals':
      return `Use at most ${error.max} decimal places.`;
  }
}

/** Human-readable message for a date validation failure (Req 2.8). */
function dateErrorMessage(error: NonNullable<FieldErrors['date']>): string {
  switch (error.kind) {
    case 'not-a-date':
      return 'Enter a valid calendar date.';
    case 'too-early':
      return `Enter a date on or after ${error.min}.`;
    case 'in-future':
      return 'Enter a date no later than today.';
  }
}

/** Human-readable message for a description validation failure (Req 2.1). */
function descriptionErrorMessage(
  error: NonNullable<FieldErrors['description']>,
): string {
  return `Use at most ${error.max} characters (currently ${error.actual}).`;
}

/**
 * Run a promise with a hard timeout. Rejects if `promise` has not settled
 * within `timeoutMs`, so a slow Data_Store write is treated as a save failure
 * (Req 2.10). The pending timer is always cleared.
 */
function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error('Save timed out'));
    }, timeoutMs);

    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Render the expense entry form.
 *
 * @param familyId - The active family's id, used to scope the write via
 *   {@link expenseRepository.addExpense}. Defaults to `null` until the
 *   `FamilyProvider`/routing wiring lands (tasks 28.4/31); while `null`, a
 *   submit is treated as a save error so no unscoped write is attempted.
 */
export function ExpenseEntryForm({
  familyId = null,
}: { familyId?: string | null } = {}): JSX.Element {
  const { member } = useAuth();

  const [form, setForm] = useState<ExpenseFormInput>(EMPTY_FORM);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  // Identifies the in-flight save so a result that arrives after a newer
  // submission (or after the timeout) is ignored.
  const saveAttemptRef = useRef(0);

  const isSaving = saveState.kind === 'saving';

  const updateField = useCallback(
    <K extends keyof ExpenseFormInput>(key: K, value: ExpenseFormInput[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      // Validate against "now": an empty date resolves to today (Req 2.7).
      const result = validateExpenseForm(form, new Date());
      if (!result.ok) {
        // Per-field inline messages; nothing is stored (Req 2.4, 2.5, 2.6, 2.8).
        setFieldErrors(result.error);
        setSaveState({ kind: 'idle' });
        return;
      }

      setFieldErrors({});

      if (member === null || familyId === null) {
        // No active Session/resolved family to attribute the expense to: treat
        // as a save error and retain the entered values. The `familyId === null`
        // guard is a SHIM (tasks 28.4/31) until `useFamily` supplies the id.
        setSaveState({ kind: 'error' });
        return;
      }

      const attemptId = saveAttemptRef.current + 1;
      saveAttemptRef.current = attemptId;
      setSaveState({ kind: 'saving' });

      try {
        await withTimeout(
          expenseRepository.addExpense(familyId, result.value, member),
          SAVE_TIMEOUT_MS,
        );
        if (saveAttemptRef.current !== attemptId) {
          return;
        }
        // Success: confirm and clear every field (Req 2.9).
        setForm(EMPTY_FORM);
        setSaveState({ kind: 'success' });
      } catch {
        if (saveAttemptRef.current !== attemptId) {
          return;
        }
        // Failure or timeout: show the error and retain all values (Req 2.10).
        setSaveState({ kind: 'error' });
      }
    },
    [form, member, familyId],
  );

  const descriptionLength = useMemo(
    () => Array.from(form.description).length,
    [form.description],
  );

  return (
    <form onSubmit={handleSubmit} style={formStyle} noValidate>
      <h1>Add expense</h1>

      {/* Amount: required, numeric, 0.01..999,999,999.99, <= 2 decimals (Req 2.1, 2.4). */}
      <div style={fieldStyle}>
        <label htmlFor="expense-amount">Amount</label>
        <input
          id="expense-amount"
          name="amount"
          type="number"
          inputMode="decimal"
          step="0.01"
          min={MIN_AMOUNT}
          max={MAX_AMOUNT}
          value={form.amount}
          onChange={(event) => updateField('amount', event.target.value)}
          disabled={isSaving}
          aria-invalid={fieldErrors.amount !== undefined}
          aria-describedby={
            fieldErrors.amount !== undefined ? 'expense-amount-error' : undefined
          }
          style={controlStyle}
        />
        {fieldErrors.amount !== undefined && (
          <span id="expense-amount-error" role="alert" style={fieldErrorStyle}>
            {amountErrorMessage(fieldErrors.amount)}
          </span>
        )}
      </div>

      {/* Category: required selection (Req 2.1, 2.5). */}
      <div style={fieldStyle}>
        <label htmlFor="expense-category">Category</label>
        <select
          id="expense-category"
          name="category"
          value={form.category ?? ''}
          onChange={(event) => updateField('category', event.target.value)}
          disabled={isSaving}
          aria-invalid={fieldErrors.category !== undefined}
          aria-describedby={
            fieldErrors.category !== undefined
              ? 'expense-category-error'
              : undefined
          }
          style={controlStyle}
        >
          <option value="">Select a category</option>
          {CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </select>
        {fieldErrors.category !== undefined && (
          <span id="expense-category-error" role="alert" style={fieldErrorStyle}>
            Select a category.
          </span>
        )}
      </div>

      {/* Source: required selection (Req 2.1, 2.6). */}
      <div style={fieldStyle}>
        <label htmlFor="expense-source">Source</label>
        <select
          id="expense-source"
          name="source"
          value={form.source ?? ''}
          onChange={(event) => updateField('source', event.target.value)}
          disabled={isSaving}
          aria-invalid={fieldErrors.source !== undefined}
          aria-describedby={
            fieldErrors.source !== undefined ? 'expense-source-error' : undefined
          }
          style={controlStyle}
        >
          <option value="">Select a source</option>
          {SOURCES.map((source) => (
            <option key={source} value={source}>
              {source}
            </option>
          ))}
        </select>
        {fieldErrors.source !== undefined && (
          <span id="expense-source-error" role="alert" style={fieldErrorStyle}>
            Select a source.
          </span>
        )}
      </div>

      {/* Date: optional; empty defaults to today (Req 2.1, 2.7, 2.8). */}
      <div style={fieldStyle}>
        <label htmlFor="expense-date">Date</label>
        <input
          id="expense-date"
          name="date"
          type="date"
          min={MIN_DATE}
          value={form.date ?? ''}
          onChange={(event) => updateField('date', event.target.value)}
          disabled={isSaving}
          aria-invalid={fieldErrors.date !== undefined}
          aria-describedby={
            fieldErrors.date !== undefined ? 'expense-date-error' : undefined
          }
          style={controlStyle}
        />
        {fieldErrors.date !== undefined && (
          <span id="expense-date-error" role="alert" style={fieldErrorStyle}>
            {dateErrorMessage(fieldErrors.date)}
          </span>
        )}
      </div>

      {/* Description: optional, 0..280 characters (Req 2.1). */}
      <div style={fieldStyle}>
        <label htmlFor="expense-description">Description</label>
        <textarea
          id="expense-description"
          name="description"
          rows={3}
          maxLength={MAX_DESCRIPTION_LENGTH}
          value={form.description}
          onChange={(event) => updateField('description', event.target.value)}
          disabled={isSaving}
          aria-invalid={fieldErrors.description !== undefined}
          aria-describedby={
            fieldErrors.description !== undefined
              ? 'expense-description-error'
              : undefined
          }
          style={controlStyle}
        />
        <span style={counterStyle}>
          {descriptionLength}/{MAX_DESCRIPTION_LENGTH}
        </span>
        {fieldErrors.description !== undefined && (
          <span
            id="expense-description-error"
            role="alert"
            style={fieldErrorStyle}
          >
            {descriptionErrorMessage(fieldErrors.description)}
          </span>
        )}
      </div>

      {/* Save-failed error; entered values are retained (Req 2.10). */}
      {saveState.kind === 'error' && (
        <p role="alert" style={saveErrorStyle}>
          {SAVE_FAILED_MESSAGE}
        </p>
      )}

      {/* Success confirmation; fields are cleared on success (Req 2.9). */}
      {saveState.kind === 'success' && (
        <p role="status" aria-live="polite" style={successStyle}>
          {SAVE_SUCCESS_MESSAGE}
        </p>
      )}

      <button
        type="submit"
        disabled={isSaving}
        aria-busy={isSaving}
        style={buttonStyle}
      >
        {isSaving ? 'Saving…' : 'Save expense'}
      </button>
    </form>
  );
}
