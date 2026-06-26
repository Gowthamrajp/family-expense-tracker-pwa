/**
 * Income screen.
 *
 * Lets a family record money coming IN (salary, interest, refunds, etc.) and
 * review it. Each income has an amount, a free-text source label, a date, and
 * an optional note. Wired via {@link useIncome}; amounts honor privacy mode
 * through {@link Money}.
 *
 * Shows the current month's income total as a hero, an add/edit form (the
 * shared {@link IncomeEntryForm}), and the list of recorded income with inline
 * edit/delete.
 */
import { useMemo, useState } from 'react';

import { type Income as IncomeRecord } from '../domain/types';
import { currentMonthKey, totalForMonth } from '../domain/insights';
import { useIncome } from '../state/useIncome';
import { IncomeEntryForm } from './IncomeEntryForm';
import { Money } from './Money';
import { Loader } from './Loader';

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Props for {@link Income}. */
export interface IncomeProps {
  familyId?: string | null;
  active?: boolean;
}

/** Render the income tracking screen. */
export function Income({ familyId = null, active = true }: IncomeProps = {}): JSX.Element {
  const { incomes, status, retry, deleteIncome } = useIncome(familyId, active);

  // The income currently being edited (shown in the top form), or null when
  // adding a new entry.
  const [editing, setEditing] = useState<IncomeRecord | null>(null);
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

  const startEdit = (income: IncomeRecord) => {
    setEditing(income);
    // Bring the form into view on small screens.
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDelete = async (incomeId: string) => {
    setDeletingId(incomeId);
    try {
      await deleteIncome(incomeId);
      if (editing?.id === incomeId) {
        setEditing(null);
      }
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

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

      {/* Add / edit form (shared component). */}
      <section className="glass-card p-card_padding flex flex-col gap-4" aria-labelledby="income-form-heading">
        <h2 id="income-form-heading" className="text-headline-md font-semibold text-on-surface">
          {editing !== null ? 'Edit income' : 'Add income'}
        </h2>
        <IncomeEntryForm
          // Remount when switching between add and a specific edit target so
          // the form re-seeds its fields from the right record.
          key={editing?.id ?? 'new'}
          familyId={familyId}
          existingIncome={editing ?? undefined}
          onSaved={() => setEditing(null)}
          onCancel={editing !== null ? () => setEditing(null) : undefined}
        />
      </section>

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
