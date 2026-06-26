/**
 * Reusable income entry form (add + edit).
 *
 * Extracted from the Income screen so the same form can be reused on the
 * combined Add screen (which toggles between recording an expense and recording
 * income). It captures an amount, a free-text source label (with suggestions),
 * a date (defaults to today), and an optional note, validates them with the
 * shared validators, and persists via {@link useIncome}.
 *
 * In add mode it clears on success; in edit mode (`existingIncome` provided) it
 * updates the record. The optional `onSaved` callback fires after a successful
 * create or update so a host can close/refresh.
 */
import { useState } from 'react';

import {
  DEFAULT_INCOME_SOURCES,
  type Income as IncomeRecord,
  type IncomeInput,
} from '../domain/types';
import {
  MAX_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
  MIN_AMOUNT,
  MIN_DATE,
  validateAmount,
  validateDate,
  validateDescription,
} from '../domain/validation';
import { useIncome } from '../state/useIncome';

const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md w-full';
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

/** Format a stored Date as the `yyyy-mm-dd` value a native date input expects. */
function toDateInputValue(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

interface FormState {
  amount: string;
  source: string;
  date: string;
  description: string;
}

function freshForm(): FormState {
  return { amount: '', source: '', date: toDateInputValue(new Date()), description: '' };
}

function formFromIncome(income: IncomeRecord): FormState {
  return {
    amount: income.amount.toString(),
    source: income.source,
    date: toDateInputValue(income.date),
    description: income.description,
  };
}

interface IncomeErrors {
  amount?: string;
  source?: string;
  date?: string;
  description?: string;
}

/** Props for {@link IncomeEntryForm}. */
export interface IncomeEntryFormProps {
  /** Active family id, or `null` while no family is resolved. */
  familyId?: string | null;
  /** When provided, the form edits this record instead of creating a new one. */
  existingIncome?: IncomeRecord;
  /** Called after a successful create or update. */
  onSaved?: () => void;
  /** Optional cancel control (e.g. to exit edit mode); shown when provided. */
  onCancel?: () => void;
}

/** Render the income add/edit form. */
export function IncomeEntryForm({
  familyId = null,
  existingIncome,
  onSaved,
  onCancel,
}: IncomeEntryFormProps = {}): JSX.Element {
  const isEditMode = existingIncome !== undefined;
  const { addIncome, updateIncome } = useIncome(familyId);

  const [form, setForm] = useState<FormState>(() =>
    existingIncome !== undefined ? formFromIncome(existingIncome) : freshForm(),
  );
  const [errors, setErrors] = useState<IncomeErrors>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSaving) {
      return;
    }
    const next: IncomeErrors = {};

    const amountResult = validateAmount(form.amount);
    if (!amountResult.ok) {
      next.amount = 'Enter a valid amount.';
    }
    if (form.source.trim() === '') {
      next.source = 'Enter an income source.';
    }
    const dateResult = validateDate(form.date, new Date());
    if (!dateResult.ok) {
      next.date = 'Enter a valid date (not in the future).';
    }
    const descriptionResult = validateDescription(form.description);
    if (!descriptionResult.ok) {
      next.description = `Use at most ${MAX_DESCRIPTION_LENGTH} characters.`;
    }

    if (Object.keys(next).length > 0) {
      setErrors(next);
      setConfirmation(null);
      return;
    }

    setErrors({});
    setConfirmation(null);
    setIsSaving(true);
    try {
      const input: IncomeInput = {
        amount: (amountResult as { ok: true; value: number }).value,
        source: form.source.trim(),
        date: (dateResult as { ok: true; value: Date }).value,
        description: (descriptionResult as { ok: true; value: string }).value,
      };
      if (isEditMode) {
        await updateIncome(existingIncome.id, input);
        setConfirmation('Income updated.');
      } else {
        await addIncome(input);
        setConfirmation('Income added.');
        setForm(freshForm());
      }
      onSaved?.();
    } catch {
      setErrors({ amount: 'Saving failed. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const descriptionLength = Array.from(form.description).length;

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <label className={FIELD_CLASS}>
          Amount
          <input
            type="number"
            inputMode="decimal"
            step="0.01"
            min={MIN_AMOUNT}
            max={MAX_AMOUNT}
            value={form.amount}
            onChange={(e) => setField('amount', e.target.value)}
            disabled={isSaving}
            aria-invalid={errors.amount !== undefined}
            data-testid="income-amount"
            className={CONTROL_CLASS}
          />
          {errors.amount && <span role="alert" className="text-error text-xs">{errors.amount}</span>}
        </label>
        <label className={FIELD_CLASS}>
          Source
          <input
            type="text"
            list="income-source-suggestions"
            value={form.source}
            onChange={(e) => setField('source', e.target.value)}
            disabled={isSaving}
            placeholder="Salary, Interest, …"
            aria-invalid={errors.source !== undefined}
            data-testid="income-source"
            className={CONTROL_CLASS}
            autoComplete="off"
          />
          <datalist id="income-source-suggestions">
            {DEFAULT_INCOME_SOURCES.map((s) => (
              <option key={s} value={s} />
            ))}
          </datalist>
          {errors.source && <span role="alert" className="text-error text-xs">{errors.source}</span>}
        </label>
        <label className={FIELD_CLASS}>
          Date <span className="text-on-surface-variant/60">(defaults to today)</span>
          <input
            type="date"
            min={MIN_DATE}
            value={form.date}
            onChange={(e) => setField('date', e.target.value)}
            disabled={isSaving}
            aria-invalid={errors.date !== undefined}
            data-testid="income-date"
            className={`${CONTROL_CLASS} [color-scheme:dark]`}
          />
          {errors.date && <span role="alert" className="text-error text-xs">{errors.date}</span>}
        </label>
        <label className={FIELD_CLASS}>
          Note (optional)
          <input
            type="text"
            value={form.description}
            onChange={(e) => setField('description', e.target.value)}
            disabled={isSaving}
            maxLength={MAX_DESCRIPTION_LENGTH}
            data-testid="income-note"
            className={CONTROL_CLASS}
            autoComplete="off"
          />
          <span className="text-xs text-on-surface-variant self-end">
            {descriptionLength}/{MAX_DESCRIPTION_LENGTH}
          </span>
          {errors.description && (
            <span role="alert" className="text-error text-xs">{errors.description}</span>
          )}
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
          data-testid="income-save"
          className="btn-primary px-5 py-3 flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            {isEditMode ? 'save' : 'add'}
          </span>
          {isSaving ? 'Saving…' : isEditMode ? 'Save changes' : 'Add income'}
        </button>
        {onCancel && (
          <button
            type="button"
            onClick={onCancel}
            disabled={isSaving}
            className="btn-ghost px-4 py-3 text-sm text-on-surface-variant"
          >
            Cancel
          </button>
        )}
      </div>
      {confirmation && (
        <p role="status" aria-live="polite" className="text-primary-container text-sm">
          {confirmation}
        </p>
      )}
    </form>
  );
}
