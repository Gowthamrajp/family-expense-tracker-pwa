/**
 * Combined "Add" screen.
 *
 * Clubs the two record-creation flows behind a single Add entry point: a
 * segmented toggle switches between recording an Expense (money out) and
 * recording Income (money in). This keeps one "Add" tab in the navigation
 * instead of separate add-expense / add-income destinations.
 *
 * The expense flow reuses {@link ExpenseEntryForm} (which carries its own
 * glass-card shell), so it's rendered bare here. The income flow reuses the
 * extracted {@link IncomeEntryForm}, wrapped in a matching card.
 */
import { useState } from 'react';

import { ExpenseEntryForm } from './ExpenseEntryForm';
import { IncomeEntryForm } from './IncomeEntryForm';

/** Which kind of record the Add screen is currently capturing. */
type Mode = 'expense' | 'income';

/** Props for {@link AddEntry}. */
export interface AddEntryProps {
  familyId?: string | null;
  /** Initial mode; defaults to recording an expense. */
  initialMode?: Mode;
}

/** Render the combined add-expense / add-income screen. */
export function AddEntry({ familyId = null, initialMode = 'expense' }: AddEntryProps = {}): JSX.Element {
  const [mode, setMode] = useState<Mode>(initialMode);

  return (
    <div className="p-5 md:px-container_padding md:py-8 flex justify-center">
      <div className="w-full max-w-xl flex flex-col gap-5">
        {/* Expense / Income segmented toggle. */}
        <div
          role="tablist"
          aria-label="What would you like to add?"
          className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-center"
        >
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'expense'}
            onClick={() => setMode('expense')}
            data-testid="add-toggle-expense"
            className={`px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'expense'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              south_west
            </span>
            Expense
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={mode === 'income'}
            onClick={() => setMode('income')}
            data-testid="add-toggle-income"
            className={`px-5 py-2 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-all ${
              mode === 'income'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">
              north_east
            </span>
            Income
          </button>
        </div>

        {mode === 'expense' ? (
          // ExpenseEntryForm renders its own centered max-w-xl card; mounting it
          // here keeps the same look, with the toggle above it.
          <ExpenseEntryForm familyId={familyId} />
        ) : (
          <section className="glass-card p-card_padding flex flex-col gap-4" aria-label="Add income">
            <h1 className="text-headline-md font-semibold text-on-surface">Add income</h1>
            <IncomeEntryForm familyId={familyId} />
          </section>
        )}
      </div>
    </div>
  );
}
