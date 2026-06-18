/**
 * Recurring payments screen.
 *
 * Lets a member define recurring-payment rules (amount, category, source,
 * optional sub-source, description, frequency, start date) that the app
 * auto-materializes into expenses when any member opens the app — there is no
 * server scheduler, so generation happens client-side via
 * {@link recurringRepository.materializeDueExpenses} on family resolution.
 *
 * Wired via {@link useRecurring}: lists existing rules with pause/resume and
 * delete, and an add form with the same validation as the expense entry form.
 * Category and sub-source options come from {@link useCategories} /
 * {@link useSubSources}. Amounts honor privacy mode through {@link Money}.
 */
import { useMemo, useState } from 'react';

import {
  RECURRING_FREQUENCIES,
  type RecurringFrequency,
} from '../domain/types';
import { useAuth } from '../state/AuthProvider';
import { useCategories } from '../state/useCategories';
import { useRecurring, type RecurringFormErrors } from '../state/useRecurring';
import { useSources } from '../state/useSources';
import { useSubSources } from '../state/useSubSources';
import { Money } from './Money';
import { Loader } from './Loader';

/** Shared control classes. */
const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md w-full';
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

/** Human label for a frequency. */
function frequencyLabel(frequency: RecurringFrequency): string {
  switch (frequency) {
    case 'daily':
      return 'Daily';
    case 'weekly':
      return 'Weekly';
    case 'monthly':
      return 'Monthly';
    case 'bimonthly':
      return 'Every 2 months';
    case 'quarterly':
      return 'Quarterly';
    case 'half-yearly':
      return 'Half-yearly';
    case 'yearly':
      return 'Yearly';
  }
}

/** Format a Date as a readable day (e.g. "Jan 5, 2025"). */
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

/** Props for {@link Recurring}. */
export interface RecurringProps {
  familyId?: string | null;
}

/**
 * Render the recurring-payments management screen.
 */
export function Recurring({ familyId = null }: RecurringProps = {}): JSX.Element {
  const { member } = useAuth();
  const { categories } = useCategories(familyId);
  const { forSource } = useSubSources(familyId);
  const { sources } = useSources(familyId);
  const { rules, status, addRule, deleteRule, setRuleActive } = useRecurring(
    familyId,
    member,
  );

  const [amount, setAmount] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [source, setSource] = useState<string>('');
  const [subSourceId, setSubSourceId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [errors, setErrors] = useState<RecurringFormErrors>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const subSourceOptions = forSource(source);

  const handleAdd = async () => {
    if (isAdding) {
      return;
    }
    setErrors({});
    setConfirmation(null);
    setIsAdding(true);
    try {
      const result = await addRule({
        amount,
        categoryId,
        source,
        subSourceId,
        description,
        frequency,
        startDate,
      });
      if (result.ok) {
        setAmount('');
        setDescription('');
        setStartDate('');
        setSubSourceId('');
        setConfirmation('Recurring payment added.');
      } else {
        setErrors(result.error);
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleDelete = async (ruleId: string) => {
    setDeletingId(ruleId);
    try {
      await deleteRule(ruleId);
    } finally {
      setDeletingId(null);
    }
  };

  return (
    <section
      data-screen="recurring"
      aria-label="Recurring payments"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap max-w-4xl"
    >
      <div>
        <p className="text-label-caps uppercase tracking-widest text-primary-container mb-1">
          Automation
        </p>
        <h1 className="text-headline-lg font-bold text-on-surface">Recurring payments</h1>
        <p className="text-on-surface-variant text-body-md mt-2">
          Define a payment once and we'll log it automatically each period when
          the app is opened — catching up on any missed periods.
        </p>
      </div>

      {/* Add rule form. */}
      <section className="glass-card p-card_padding flex flex-col gap-4" aria-labelledby="add-recurring-heading">
        <h2 id="add-recurring-heading" className="text-headline-md font-semibold text-on-surface">
          New recurring payment
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={FIELD_CLASS}>
            Amount
            <input
              type="number"
              inputMode="decimal"
              step="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={isAdding}
              aria-invalid={errors.amount === true}
              className={CONTROL_CLASS}
            />
            {errors.amount && (
              <span role="alert" className="text-error text-xs">Enter a valid amount.</span>
            )}
          </label>
          <label className={FIELD_CLASS}>
            Frequency
            <select
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as RecurringFrequency)}
              disabled={isAdding}
              className={CONTROL_CLASS}
            >
              {RECURRING_FREQUENCIES.map((f) => (
                <option key={f} value={f}>{frequencyLabel(f)}</option>
              ))}
            </select>
          </label>
          <label className={FIELD_CLASS}>
            Category
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(e.target.value)}
              disabled={isAdding}
              aria-invalid={errors.category === true}
              className={CONTROL_CLASS}
            >
              <option value="">Select a category</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {errors.category && (
              <span role="alert" className="text-error text-xs">Select a category.</span>
            )}
          </label>
          <label className={FIELD_CLASS}>
            Source
            <select
              value={source}
              onChange={(e) => {
                setSource(e.target.value);
                setSubSourceId('');
              }}
              disabled={isAdding}
              className={CONTROL_CLASS}
            >
              <option value="">Select a source</option>
              {sources.map((s) => (
                <option key={s.id} value={s.name}>{s.name}</option>
              ))}
            </select>
          </label>
          {subSourceOptions.length > 0 && (
            <label className={FIELD_CLASS}>
              Card/account (optional)
              <select
                value={subSourceId}
                onChange={(e) => setSubSourceId(e.target.value)}
                disabled={isAdding}
                className={CONTROL_CLASS}
              >
                <option value="">No specific card/account</option>
                {subSourceOptions.map((ss) => (
                  <option key={ss.id} value={ss.id}>
                    {ss.nickname}{ss.last4 ? ` ••${ss.last4}` : ''}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className={FIELD_CLASS}>
            Start date
            <input
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
              disabled={isAdding}
              aria-invalid={errors.startDate === true}
              className={`${CONTROL_CLASS} [color-scheme:dark]`}
            />
            {errors.startDate && (
              <span role="alert" className="text-error text-xs">Enter a valid date (not in the future).</span>
            )}
          </label>
          <label className={`${FIELD_CLASS} sm:col-span-2`}>
            Description (optional)
            <input
              type="text"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              disabled={isAdding}
              maxLength={280}
              className={CONTROL_CLASS}
              autoComplete="off"
            />
          </label>
        </div>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          className="btn-primary px-5 py-3 self-start flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">autorenew</span>
          {isAdding ? 'Adding…' : 'Add recurring payment'}
        </button>
        {confirmation && (
          <p role="status" className="text-primary-container text-sm">{confirmation}</p>
        )}
      </section>

      {/* Existing rules. */}
      <section className="flex flex-col gap-3" aria-label="Existing recurring payments">
        <h2 className="text-headline-md font-semibold text-on-surface">Active &amp; paused</h2>
        {status === 'loading' ? (
          <Loader label="Loading recurring payments…" block />
        ) : status === 'error' ? (
          <p role="alert" className="text-error">Recurring payments could not be loaded.</p>
        ) : rules.length === 0 ? (
          <div className="glass-card p-card_padding text-center text-on-surface-variant">
            No recurring payments yet.
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {rules.map((rule) => {
              const categoryName = categoryNameById.get(rule.categoryId) ?? 'Category';
              const isDeleting = deletingId === rule.id;
              return (
                <li
                  key={rule.id}
                  data-testid="recurring-row"
                  className="glass-card glass-card-hover p-4 flex items-center gap-4"
                >
                  <div className="shrink-0 w-11 h-11 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
                    <span className="material-symbols-outlined" aria-hidden="true">autorenew</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-on-surface">{categoryName}</span>
                      <span className="text-xs px-2 py-0.5 rounded-full bg-surface-container-high/60 text-on-surface-variant uppercase tracking-wide">
                        {frequencyLabel(rule.frequency)}
                      </span>
                      {!rule.active && (
                        <span className="text-xs px-2 py-0.5 rounded-full bg-tertiary-container/20 text-tertiary-container uppercase tracking-wide">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-on-surface-variant mt-0.5 flex items-center gap-2 flex-wrap">
                      <span>{rule.source}</span>
                      <span aria-hidden="true">•</span>
                      <span>Since {dateFormatter.format(rule.startDate)}</span>
                      {rule.description && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span className="truncate">{rule.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Money amount={rule.amount} className="font-mono-data text-lg font-semibold text-white shrink-0" />
                  <div className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void setRuleActive(rule.id, !rule.active)}
                      aria-label={rule.active ? 'Pause recurring payment' : 'Resume recurring payment'}
                      className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">
                        {rule.active ? 'pause' : 'play_arrow'}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={() => void handleDelete(rule.id)}
                      disabled={isDeleting}
                      aria-busy={isDeleting}
                      aria-label="Delete recurring payment"
                      className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </section>
  );
}
