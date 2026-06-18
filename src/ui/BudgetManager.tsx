/**
 * Monthly budget configuration card for Family settings.
 *
 * Lets a member set the family's single rolling monthly budget either as a
 * FIXED AMOUNT (a rupee cap per month) or as a PERCENTAGE of the previous
 * month's spend, mirroring the Stitch "Budget Configuration" design's pill
 * toggle. It validates the value via {@link useBudget}'s `setBudget` (which
 * delegates to the pure {@link validateBudgetValue}) and shows a live preview
 * of the effective limit for the current month. A member can also clear the
 * budget.
 *
 * The budget applies to every calendar month; there is no per-month document.
 */
import { useEffect, useMemo, useState } from 'react';

import { useAuth } from '../state/AuthProvider';
import { useBudget } from '../state/useBudget';
import { useExpenses } from '../state/useExpenses';
import {
  MAX_BUDGET_AMOUNT,
  MAX_BUDGET_PERCENT,
  effectiveMonthlyLimit,
} from '../domain/budget';
import {
  currentMonthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import type { BudgetMode } from '../domain/types';
import { Loader } from './Loader';
import { formatINR } from './Money';

const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md';
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

/** Map a budget validation error to a human-readable message. */
function budgetErrorMessage(kind: string, mode: BudgetMode): string {
  switch (kind) {
    case 'required':
      return mode === 'amount'
        ? 'Enter a monthly amount.'
        : 'Enter a percentage.';
    case 'not-numeric':
      return 'Enter a numeric value.';
    case 'too-small':
      return 'Enter a value greater than zero.';
    case 'too-large':
      return mode === 'amount'
        ? `Enter an amount no greater than ${formatINR(MAX_BUDGET_AMOUNT)}.`
        : `Enter a percentage no greater than ${MAX_BUDGET_PERCENT}%.`;
    default:
      return 'Enter a valid value.';
  }
}

/** Props for {@link BudgetManager}. */
export interface BudgetManagerProps {
  /** Active family id, or `null` while no family is resolved. */
  familyId: string | null;
}

/**
 * Render the monthly budget configuration card.
 */
export function BudgetManager({ familyId }: BudgetManagerProps): JSX.Element {
  const { member } = useAuth();
  const { budget, status, setBudget, clearBudget } = useBudget(familyId, member);
  const { expenses } = useExpenses(familyId);

  const [mode, setMode] = useState<BudgetMode>('amount');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  // Tracks whether the form has been seeded from the loaded budget yet, so the
  // member's in-progress edits are never clobbered by the live subscription.
  const [hydrated, setHydrated] = useState(false);

  // Seed the form once from the loaded budget (or defaults when none exists).
  useEffect(() => {
    if (status !== 'ready' || hydrated) {
      return;
    }
    if (budget !== null) {
      setMode(budget.mode);
      setValue(
        budget.mode === 'amount'
          ? (budget.amount ?? '').toString()
          : (budget.percent ?? '').toString(),
      );
    }
    setHydrated(true);
  }, [status, budget, hydrated]);

  const today = new Date();
  const prevTotal = totalForMonth(expenses, previousMonthKey(today));
  const curKey = currentMonthKey(today);

  // Live preview of the effective limit for the value currently typed.
  const previewLimit = useMemo(() => {
    const numeric = Number(value.trim());
    if (!Number.isFinite(numeric) || numeric <= 0) {
      return null;
    }
    return effectiveMonthlyLimit(
      {
        mode,
        ...(mode === 'amount' ? { amount: numeric } : { percent: numeric }),
        updatedBy: '',
        updatedAt: today,
      },
      prevTotal,
    );
  }, [value, mode, prevTotal]);

  const handleSave = async (): Promise<void> => {
    if (isSaving) {
      return;
    }
    setError(null);
    setConfirmation(null);
    setIsSaving(true);
    try {
      const result = await setBudget(mode, value);
      if (result.ok) {
        setConfirmation('Monthly budget saved.');
      } else {
        setError(budgetErrorMessage(result.error.kind, mode));
      }
    } finally {
      setIsSaving(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setError(null);
    setConfirmation(null);
    await clearBudget();
    setValue('');
    setConfirmation('Monthly budget cleared.');
  };

  return (
    <section
      className="glass-card glass-card-hover p-card_padding flex flex-col gap-4"
      aria-labelledby="budget-heading"
      data-testid="budget-manager"
    >
      <div className="flex items-center gap-3">
        <span className="shrink-0 w-10 h-10 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
          <span className="material-symbols-outlined" aria-hidden="true">
            account_balance_wallet
          </span>
        </span>
        <div>
          <h2 id="budget-heading" className="text-headline-md font-semibold text-on-surface">
            Monthly budget
          </h2>
          <p className="text-sm text-on-surface-variant">
            Set a spending cap for each month. You'll be alerted as you add
            transactions and can track it in Insights.
          </p>
        </div>
      </div>

      {status === 'loading' ? (
        <Loader label="Loading budget…" />
      ) : (
        <>
          {status === 'error' && (
            <p role="alert" className="text-error">
              The budget could not be loaded.
            </p>
          )}

          {/* Mode toggle: fixed amount vs percentage of last month. */}
          <div
            className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-start"
            role="group"
            aria-label="Budget type"
          >
            <button
              type="button"
              onClick={() => {
                setMode('amount');
                setError(null);
                setConfirmation(null);
              }}
              data-testid="budget-mode-amount"
              aria-pressed={mode === 'amount'}
              className={`px-5 py-2 rounded-full text-[12px] font-label-caps uppercase tracking-wider transition-all ${
                mode === 'amount'
                  ? 'bg-primary-container text-on-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Fixed amount
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('percent');
                setError(null);
                setConfirmation(null);
              }}
              data-testid="budget-mode-percent"
              aria-pressed={mode === 'percent'}
              className={`px-5 py-2 rounded-full text-[12px] font-label-caps uppercase tracking-wider transition-all ${
                mode === 'percent'
                  ? 'bg-primary-container text-on-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Percentage
            </button>
          </div>

          <div className="flex flex-wrap gap-3 items-end">
            <label className={`${FIELD_CLASS} flex-1 min-w-[12rem]`}>
              {mode === 'amount' ? 'Monthly limit (₹)' : 'Percent of last month (%)'}
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-container font-semibold">
                  {mode === 'amount' ? '₹' : '%'}
                </span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step={mode === 'amount' ? '1' : '0.1'}
                  value={value}
                  onChange={(event) => {
                    setValue(event.target.value);
                    if (error) {
                      setError(null);
                    }
                    if (confirmation) {
                      setConfirmation(null);
                    }
                  }}
                  disabled={isSaving}
                  placeholder={mode === 'amount' ? '40000' : '90'}
                  aria-invalid={error !== null}
                  data-testid="budget-value-input"
                  className={`${CONTROL_CLASS} w-full pl-8`}
                />
              </div>
            </label>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={isSaving}
              aria-busy={isSaving}
              data-testid="budget-save"
              className="btn-primary px-5 py-2.5 flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                check_circle
              </span>
              {isSaving ? 'Saving…' : 'Save budget'}
            </button>
            {budget !== null && (
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={isSaving}
                data-testid="budget-clear"
                className="btn-ghost px-4 py-2.5 text-sm text-on-surface-variant hover:text-error"
              >
                Clear
              </button>
            )}
          </div>

          {/* Live preview of the effective monthly limit. */}
          {previewLimit !== null && (
            <div className="flex items-center gap-2 text-sm text-on-surface-variant">
              <span className="material-symbols-outlined text-base text-primary-container" aria-hidden="true">
                info
              </span>
              {mode === 'percent' && prevTotal <= 0 ? (
                <span>
                  No spending last month yet, so a {value}% cap can't be derived
                  until there's a previous month to compare against.
                </span>
              ) : (
                <span data-testid="budget-preview">
                  Effective limit for {curKey}:{' '}
                  <span className="text-on-surface font-semibold">
                    {formatINR(previewLimit)}
                  </span>
                  {mode === 'percent' && (
                    <> ({value}% of {formatINR(prevTotal)} last month)</>
                  )}
                </span>
              )}
            </div>
          )}

          {error !== null && (
            <p role="alert" className="text-error text-sm" data-testid="budget-error">
              {error}
            </p>
          )}
          {confirmation !== null && (
            <p role="status" aria-live="polite" className="text-primary-container text-sm">
              {confirmation}
            </p>
          )}
        </>
      )}
    </section>
  );
}
