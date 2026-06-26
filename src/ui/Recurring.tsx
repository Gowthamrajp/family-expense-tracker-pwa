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
  DEFAULT_INCOME_SOURCES,
  RECURRING_FREQUENCIES,
  type RecurringFrequency,
  type RecurringRule,
} from '../domain/types';
import { useAuth } from '../state/AuthProvider';
import { useCategories } from '../state/useCategories';
import { useRecurring, type RecurringFormErrors } from '../state/useRecurring';
import { useSources } from '../state/useSources';
import { useSubCategories } from '../state/useSubCategories';
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
  const { forCategory: subCategoriesForCategory, subCategories } = useSubCategories(familyId);
  const { forSource } = useSubSources(familyId);
  const { sources } = useSources(familyId);
  const { rules, status, addRule, deleteRule, setRuleActive } = useRecurring(
    familyId,
    member,
  );

  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'expense' | 'income'>('expense');
  const [categoryId, setCategoryId] = useState('');
  const [subCategoryId, setSubCategoryId] = useState('');
  const [source, setSource] = useState<string>('');
  const [subSourceId, setSubSourceId] = useState('');
  const [description, setDescription] = useState('');
  const [frequency, setFrequency] = useState<RecurringFrequency>('monthly');
  const [startDate, setStartDate] = useState('');
  const [backfill, setBackfill] = useState(false);
  const [errors, setErrors] = useState<RecurringFormErrors>({});
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  // Rule pending a delete decision (retain vs. remove past transactions).
  const [pendingDelete, setPendingDelete] = useState<RecurringRule | null>(null);

  const categoryNameById = useMemo(
    () => new Map(categories.map((c) => [c.id, c.name])),
    [categories],
  );
  const subCategoryNameById = useMemo(
    () => new Map(subCategories.map((s) => [s.id, s.name])),
    [subCategories],
  );
  // Sub-categories available under the chosen category. A sub-category is
  // mandatory when the category has any defined (mirrors the expense form).
  const subCategoryOptions = useMemo(
    () => (categoryId !== '' ? subCategoriesForCategory(categoryId) : []),
    [categoryId, subCategoriesForCategory],
  );
  const subSourceOptions = forSource(source);

  const handleAdd = async () => {
    if (isAdding) {
      return;
    }
    const isIncome = kind === 'income';
    // Client-side guard: require a sub-category when the chosen category has
    // any, so recurring expenses are classified to the same depth as manual
    // ones (keeps insights/budgets consistent). Income rules have no category.
    if (!isIncome && subCategoryOptions.length > 0 && subCategoryId === '') {
      setErrors({ subCategory: true });
      setConfirmation(null);
      return;
    }
    setErrors({});
    setConfirmation(null);
    setIsAdding(true);
    try {
      const result = await addRule(
        {
          kind,
          amount,
          categoryId,
          subCategoryId,
          source,
          subSourceId,
          description,
          frequency,
          startDate,
        },
        backfill,
      );
      if (result.ok) {
        setAmount('');
        setDescription('');
        setStartDate('');
        setSubSourceId('');
        setSubCategoryId('');
        setCategoryId('');
        setSource('');
        setBackfill(false);
        setConfirmation(
          backfill
            ? `Recurring ${isIncome ? 'income' : 'payment'} added and past transactions backfilled.`
            : `Recurring ${isIncome ? 'income' : 'payment'} added.`,
        );
      } else {
        setErrors(result.error);
      }
    } finally {
      setIsAdding(false);
    }
  };

  // Perform the delete once the member has chosen whether to also remove the
  // rule's previously-generated transactions.
  const confirmDelete = async (deletePrevious: boolean) => {
    const rule = pendingDelete;
    if (rule === null) {
      return;
    }
    setPendingDelete(null);
    setDeletingId(rule.id);
    try {
      await deleteRule(rule.id, deletePrevious);
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
          New recurring {kind === 'income' ? 'income' : 'payment'}
        </h2>

        {/* Expense / Income toggle. */}
        <div
          role="tablist"
          aria-label="Recurring type"
          className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-start"
        >
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'expense'}
            onClick={() => { setKind('expense'); setErrors({}); setConfirmation(null); }}
            data-testid="recurring-kind-expense"
            className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-all ${
              kind === 'expense'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_upward</span>
            Expense
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={kind === 'income'}
            onClick={() => { setKind('income'); setErrors({}); setConfirmation(null); }}
            data-testid="recurring-kind-income"
            className={`px-4 py-1.5 rounded-full text-sm font-semibold flex items-center gap-1.5 transition-all ${
              kind === 'income'
                ? 'bg-primary-container text-on-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-base" aria-hidden="true">arrow_downward</span>
            Income
          </button>
        </div>

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

          {/* Income rules use a single free-text source label and skip the
              managed category/source fields. */}
          {kind === 'income' ? (
            <label className={`${FIELD_CLASS} sm:col-span-2`}>
              Source
              <input
                type="text"
                list="recurring-income-source-suggestions"
                value={source}
                onChange={(e) => setSource(e.target.value)}
                disabled={isAdding}
                placeholder="Salary, Interest, …"
                aria-invalid={errors.source === true}
                className={CONTROL_CLASS}
                autoComplete="off"
              />
              <datalist id="recurring-income-source-suggestions">
                {DEFAULT_INCOME_SOURCES.map((s) => (
                  <option key={s} value={s} />
                ))}
              </datalist>
              {errors.source && (
                <span role="alert" className="text-error text-xs">Enter an income source.</span>
              )}
            </label>
          ) : (
            <>
          <label className={FIELD_CLASS}>
            Category
            <select
              value={categoryId}
              onChange={(e) => {
                setCategoryId(e.target.value);
                // Reset sub-category whenever the category changes so a stale
                // sub-category from a different category is never submitted.
                setSubCategoryId('');
                if (errors.category || errors.subCategory) {
                  setErrors({});
                }
              }}
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
          {subCategoryOptions.length > 0 && (
            <label className={FIELD_CLASS}>
              Sub-category
              <select
                value={subCategoryId}
                onChange={(e) => {
                  setSubCategoryId(e.target.value);
                  if (errors.subCategory) {
                    setErrors({});
                  }
                }}
                disabled={isAdding}
                aria-invalid={errors.subCategory === true}
                className={CONTROL_CLASS}
              >
                <option value="">Select a sub-category</option>
                {subCategoryOptions.map((sc) => (
                  <option key={sc.id} value={sc.id}>{sc.name}</option>
                ))}
              </select>
              {errors.subCategory && (
                <span role="alert" className="text-error text-xs">Select a sub-category.</span>
              )}
            </label>
          )}
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
            </>
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
        <label className="flex items-start gap-3 cursor-pointer select-none">
          <input
            type="checkbox"
            checked={backfill}
            onChange={(e) => setBackfill(e.target.checked)}
            disabled={isAdding}
            className="mt-1 h-4 w-4 accent-primary-container"
          />
          <span className="text-sm text-on-surface">
            Backfill past transactions
            <span className="block text-xs text-on-surface-variant">
              Create expenses for every occurrence from the start date up to
              today.
            </span>
          </span>
        </label>
        <button
          type="button"
          onClick={() => void handleAdd()}
          disabled={isAdding}
          aria-busy={isAdding}
          className="btn-primary px-5 py-3 self-start flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">autorenew</span>
          {isAdding
            ? 'Adding…'
            : kind === 'income'
              ? 'Add recurring income'
              : 'Add recurring payment'}
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
              const isIncome = rule.kind === 'income';
              const categoryName = categoryNameById.get(rule.categoryId) ?? 'Category';
              const subCategoryName =
                rule.subCategoryId !== undefined
                  ? subCategoryNameById.get(rule.subCategoryId)
                  : undefined;
              // Income rules title on their free-text source; expense rules on
              // the category (+ optional sub-category).
              const title = isIncome ? rule.source : categoryName;
              const isDeleting = deletingId === rule.id;
              return (
                <li
                  key={rule.id}
                  data-testid="recurring-row"
                  className="glass-card glass-card-hover p-4 flex items-center gap-4"
                >
                  <div
                    className={`shrink-0 w-11 h-11 rounded-lg flex items-center justify-center ${
                      isIncome
                        ? 'bg-emerald-400/10 text-emerald-400'
                        : 'bg-primary-container/10 text-primary-container'
                    }`}
                  >
                    <span className="material-symbols-outlined" aria-hidden="true">
                      {isIncome ? 'arrow_downward' : 'autorenew'}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-semibold text-on-surface">
                        {title}
                        {!isIncome && subCategoryName !== undefined && (
                          <span className="text-on-surface-variant font-normal"> · {subCategoryName}</span>
                        )}
                      </span>
                      {isIncome && (
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/10 text-emerald-400 uppercase tracking-wide">
                          Income
                        </span>
                      )}
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
                      {!isIncome && (
                        <>
                          <span>{rule.source}</span>
                          <span aria-hidden="true">•</span>
                        </>
                      )}
                      <span>Since {dateFormatter.format(rule.startDate)}</span>
                      {rule.description && (
                        <>
                          <span aria-hidden="true">•</span>
                          <span className="truncate">{rule.description}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <Money
                    amount={rule.amount}
                    className={`font-mono-data text-lg font-semibold shrink-0 ${
                      isIncome ? 'text-emerald-400' : 'text-white'
                    }`}
                  />
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
                      onClick={() => setPendingDelete(rule)}
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

      {/* Delete confirmation: choose whether to also remove the rule's
          previously-generated transactions, or retain them. */}
      {pendingDelete !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setPendingDelete(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Delete recurring payment"
            data-testid="recurring-delete-dialog"
            className="glass-card p-card_padding w-full max-w-md flex flex-col gap-4"
          >
            <div className="flex items-center gap-3">
              <span className="shrink-0 w-10 h-10 rounded-lg bg-error/10 flex items-center justify-center text-error">
                <span className="material-symbols-outlined" aria-hidden="true">delete</span>
              </span>
              <h3 className="text-headline-md font-semibold text-on-surface">
                Delete recurring payment
              </h3>
            </div>
            <p className="text-sm text-on-surface-variant">
              Stop this recurring payment from generating future transactions.
              What should happen to the{' '}
              {(() => {
                const name = categoryNameById.get(pendingDelete.categoryId) ?? 'this rule';
                return <span className="text-on-surface font-medium">{name}</span>;
              })()}{' '}
              transactions it already created?
            </p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => void confirmDelete(false)}
                data-testid="recurring-delete-retain"
                className="btn-ghost px-4 py-3 flex items-center gap-2 text-left"
              >
                <span className="material-symbols-outlined text-lg text-primary-container" aria-hidden="true">
                  history
                </span>
                <span>
                  <span className="block text-on-surface font-medium">Keep past transactions</span>
                  <span className="block text-xs text-on-surface-variant">
                    Remove the rule only; previously logged expenses stay.
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => void confirmDelete(true)}
                data-testid="recurring-delete-remove"
                className="btn-ghost px-4 py-3 flex items-center gap-2 text-left text-error border-error/30 hover:bg-error/10"
              >
                <span className="material-symbols-outlined text-lg" aria-hidden="true">
                  delete_sweep
                </span>
                <span>
                  <span className="block font-medium">Delete past transactions too</span>
                  <span className="block text-xs text-on-surface-variant">
                    Remove the rule and every expense it generated.
                  </span>
                </span>
              </button>
            </div>
            <button
              type="button"
              onClick={() => setPendingDelete(null)}
              className="btn-ghost px-4 py-2 text-sm text-on-surface-variant self-end"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
