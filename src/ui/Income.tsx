/**
 * Income screen.
 *
 * Lets a family record money coming IN (salary, interest, refunds, etc.) and
 * review it. Mirrors the expense entry/list experience but leaner: each income
 * has an amount, a free-text source label, a date, and an optional note. Wired
 * via {@link useIncome}; amounts honor privacy mode through {@link Money}.
 *
 * Shows the current month's income total as a hero, an add form, and the list
 * of recorded income with inline edit/delete.
 */
import { useMemo, useState } from 'react';

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
import { currentMonthKey, totalForMonth } from '../domain/insights';
import { useIncome } from '../state/useIncome';
import { Money } from './Money';
import { Loader } from './Loader';

const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md w-full';
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Format a stored Date as the `yyyy-mm-dd` value a native date input expects. */
function toDateInputValue(date: Date): string {
  const y = date.getFullYear().toString().padStart(4, '0');
  const m = (date.getMonth() + 1).toString().padStart(2, '0');
  const d = date.getDate().toString().padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/** Editable form state. */
interface FormState {
  amount: string;
  source: string;
  date: string;
  description: string;
}

function freshForm(): FormState {
  return {
    amount: '',
    source: '',
    date: toDateInputValue(new Date()),
    description: '',
  };
}

function formFromIncome(income: IncomeRecord): FormState {
  return {
    amount: income.amount.toString(),
    source: income.source,
    date: toDateInputValue(income.date),
    description: income.description,
  };
}

/** Per-field errors for the income form. */
interface IncomeErrors {
  amount?: string;
  source?: string;
  date?: string;
  description?: string;
}

/** Props for {@link Income}. */
export interface IncomeProps {
  familyId?: string | null;
  active?: boolean;
}

/** Render the income tracking screen. */
export function Income({ familyId = null, active = true }: IncomeProps = {}): JSX.Element {
  const { incomes, status, retry, addIncome, updateIncome, deleteIncome } = useIncome(
    familyId,
    active,
  );

  const [form, setForm] = useState<FormState>(() => freshForm());
  const [errors, setErrors] = useState<IncomeErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  const today = new Date();
  const curKey = currentMonthKey(today);
  // Reuse the cents-accurate month total helper (works on any { amount, date }).
  const currentMonthIncome = totalForMonth(incomes, curKey);
  const totalIncome = useMemo(
    () => incomes.reduce((sum, i) => sum + Math.round(i.amount * 100), 0) / 100,
    [incomes],
  );

  const setField = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((current) => ({ ...current, [key]: value }));
  };

  const resetForm = () => {
    setForm(freshForm());
    setEditingId(null);
    setErrors({});
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
      if (editingId !== null) {
        await updateIncome(editingId, input);
        setConfirmation('Income updated.');
      } else {
        await addIncome(input);
        setConfirmation('Income added.');
      }
      resetForm();
    } catch {
      setErrors({ amount: 'Saving failed. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (income: IncomeRecord) => {
    setForm(formFromIncome(income));
    setEditingId(income.id);
    setErrors({});
    setConfirmation(null);
    // Bring the form into view on small screens.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (incomeId: string) => {
    setDeletingId(incomeId);
    try {
      await deleteIncome(incomeId);
      if (editingId === incomeId) {
        resetForm();
      }
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

  const descriptionLength = Array.from(form.description).length;

  return (
    <section
      data-screen="income"
      aria-label="Income"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap max-w-4xl"
    >
      <div>
        <p className="text-label-caps uppercase tracking-widest text-primary-container mb-1">
          Cash flow
        </p>
        <h1 className="text-headline-lg font-bold text-on-surface">Income</h1>
        <p className="text-on-surface-variant text-body-md mt-2">
          Track money coming in — salary, interest, refunds, gifts and more.
        </p>
      </div>

      {/* Hero: this month's income. */}
      <div className="glass-card glass-card-hover p-card_padding relative overflow-hidden">
        <h2 className="text-label-caps uppercase text-on-surface-variant mb-2">
          Income this month ({curKey})
        </h2>
        <Money
          amount={currentMonthIncome}
          testId="income-month-total"
          className="block text-[clamp(36px,7vw,56px)] leading-none font-extrabold tracking-tighter text-white neon-glow"
        />
        <p className="text-sm text-on-surface-variant mt-3">
          All-time recorded income: <Money amount={totalIncome} className="text-on-surface" />
        </p>
        <span className="material-symbols-outlined absolute right-6 top-6 text-primary-container/30 text-5xl pointer-events-none" aria-hidden="true">
          trending_up
        </span>
      </div>

      {/* Add / edit form. */}
      <form
        onSubmit={handleSubmit}
        noValidate
        className="glass-card p-card_padding flex flex-col gap-4"
        aria-labelledby="income-form-heading"
      >
        <h2 id="income-form-heading" className="text-headline-md font-semibold text-on-surface">
          {editingId !== null ? 'Edit income' : 'Add income'}
        </h2>
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
              {editingId !== null ? 'save' : 'add'}
            </span>
            {isSaving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add income'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
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

      {/* Income list. */}
      <section className="flex flex-col gap-3" aria-label="Recorded income">
        <h2 className="text-headline-md font-semibold text-on-surface">Recorded income</h2>
        {status === 'loading' ? (
          <Loader label="Loading income…" block />
        ) : status === 'error' ? (
          <div role="alert" className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4">
            <p className="text-error">Income could not be loaded.</p>
            <button type="button" onClick={retry} className="btn-ghost px-4 py-2 text-sm">Retry</button>
          </div>
        ) : incomes.length === 0 ? (
          <div className="glass-card p-card_padding flex flex-col items-center gap-3 text-center">
            <span className="material-symbols-outlined text-primary-container text-4xl" aria-hidden="true">
              savings
            </span>
            <p className="text-on-surface-variant text-body-lg">No income recorded yet.</p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {incomes.map((income) => {
              const isDeleting = deletingId === income.id;
              const isConfirming = confirmingDeleteId === income.id;
              return (
                <li
                  key={income.id}
                  data-testid="income-row"
                  className="glass-card glass-card-hover p-3 md:p-4 flex items-center gap-3"
                >
                  <div className="shrink-0 w-10 h-10 md:w-11 md:h-11 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
                    <span className="material-symbols-outlined" aria-hidden="true">payments</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-on-surface truncate">{income.source}</p>
                    <p className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-1.5 flex-wrap">
                      <span>{dateFormatter.format(income.date)}</span>
                      <span aria-hidden="true">·</span>
                      <span>{income.recordedByName ?? 'Member'}</span>
                      {income.description.trim() !== '' && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="truncate">{income.description}</span>
                        </>
                      )}
                    </p>
                  </div>
                  <Money
                    amount={income.amount}
                    className="font-mono-data text-lg font-semibold text-primary-container shrink-0"
                  />
                  {isConfirming ? (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => void handleDelete(income.id)}
                        disabled={isDeleting}
                        data-testid="income-delete-confirm"
                        className="btn-ghost px-2 py-1 text-xs text-error"
                      >
                        {isDeleting ? 'Deleting…' : 'Confirm'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(null)}
                        disabled={isDeleting}
                        data-testid="income-delete-cancel"
                        className="btn-ghost px-2 py-1 text-xs text-on-surface-variant"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <div className="shrink-0 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(income)}
                        aria-label={`Edit income ${income.source}`}
                        data-testid="income-edit"
                        className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
                      >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmingDeleteId(income.id)}
                        aria-label={`Delete income ${income.source}`}
                        data-testid="income-delete"
                        className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                      >
                        <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
