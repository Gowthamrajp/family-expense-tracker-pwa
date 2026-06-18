/**
 * Inline budget editor used for a single scope (global, a category, or a
 * sub-category) inside {@link BudgetManager}.
 *
 * Renders a compact row showing the scope name, its current effective limit
 * (when set), and an expandable editor with a Fixed-amount / Percentage pill
 * toggle, a value input, and Save/Clear. The parent owns persistence and passes
 * `onSave`/`onClear`; this component only manages local edit state and
 * surfaces validation messages.
 */
import { useEffect, useState } from 'react';

import {
  MAX_BUDGET_AMOUNT,
  MAX_BUDGET_PERCENT,
  effectiveLimit,
} from '../domain/budget';
import type { BudgetMode } from '../domain/types';
import { formatINR } from './Money';

const CONTROL_CLASS = 'ghost-input px-3 py-2 text-body-md';

/** Map a budget validation error to a human-readable message. */
function budgetErrorMessage(kind: string, mode: BudgetMode): string {
  switch (kind) {
    case 'required':
      return mode === 'amount' ? 'Enter an amount.' : 'Enter a percentage.';
    case 'not-numeric':
      return 'Enter a numeric value.';
    case 'too-small':
      return 'Enter a value greater than zero.';
    case 'too-large':
      return mode === 'amount'
        ? `Max ${formatINR(MAX_BUDGET_AMOUNT)}.`
        : `Max ${MAX_BUDGET_PERCENT}%.`;
    default:
      return 'Enter a valid value.';
  }
}

/** The currently-saved budget for this scope (or null when none). */
export interface ScopeBudgetValue {
  mode: BudgetMode;
  amount?: number;
  percent?: number;
}

/** Props for {@link BudgetScopeRow}. */
export interface BudgetScopeRowProps {
  /** Display label for the scope (category/sub-category name, or "Global"). */
  label: string;
  /** Material Symbols icon name for the scope. */
  icon: string;
  /** Indent + de-emphasize for nested (sub-category) rows. */
  nested?: boolean;
  /** The scope's previous-month spend, used to preview percent-mode limits. */
  previousTotal: number;
  /** Current calendar month key, shown in the percent preview. */
  monthKey: string;
  /** The saved budget for this scope, or null when none is set. */
  current: ScopeBudgetValue | null;
  /** Persist a budget for this scope; resolves to an error kind on failure. */
  onSave: (mode: BudgetMode, rawValue: string) => Promise<{ ok: boolean; errorKind?: string }>;
  /** Remove this scope's budget. */
  onClear: () => Promise<void>;
  /** Stable testid prefix for querying in tests. */
  testIdPrefix: string;
}

/** Render a single scope's inline budget editor. */
export function BudgetScopeRow({
  label,
  icon,
  nested = false,
  previousTotal,
  monthKey,
  current,
  onSave,
  onClear,
  testIdPrefix,
}: BudgetScopeRowProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<BudgetMode>(current?.mode ?? 'amount');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [busy, setBusy] = useState(false);

  // Seed the editor from the saved budget whenever it changes or on open.
  useEffect(() => {
    if (current !== null) {
      setMode(current.mode);
      setValue(
        current.mode === 'amount'
          ? (current.amount ?? '').toString()
          : (current.percent ?? '').toString(),
      );
    } else {
      setValue('');
    }
  }, [current, open]);

  const currentLimit =
    current === null
      ? null
      : effectiveLimit(current.mode, current.amount, current.percent, previousTotal);

  // Live preview for the value being typed.
  const numeric = Number(value.trim());
  const previewLimit =
    Number.isFinite(numeric) && numeric > 0
      ? effectiveLimit(
          mode,
          mode === 'amount' ? numeric : undefined,
          mode === 'percent' ? numeric : undefined,
          previousTotal,
        )
      : null;

  const handleSave = async (): Promise<void> => {
    if (busy) {
      return;
    }
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      const result = await onSave(mode, value);
      if (result.ok) {
        setSaved(true);
      } else {
        setError(budgetErrorMessage(result.errorKind ?? '', mode));
      }
    } finally {
      setBusy(false);
    }
  };

  const handleClear = async (): Promise<void> => {
    setError(null);
    setSaved(false);
    setBusy(true);
    try {
      await onClear();
      setValue('');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className={`rounded-2xl border border-outline-variant/10 ${
        nested ? 'bg-surface-container-lowest/40 ml-4' : 'bg-surface-container-lowest/30'
      }`}
      data-testid={`${testIdPrefix}-row`}
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        data-testid={`${testIdPrefix}-toggle`}
        className="w-full flex items-center gap-3 p-3 text-left"
      >
        <span
          className={`shrink-0 ${nested ? 'w-8 h-8' : 'w-10 h-10'} rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container`}
        >
          <span className="material-symbols-outlined text-[20px]" aria-hidden="true">
            {icon}
          </span>
        </span>
        <span className="flex-1 min-w-0">
          <span className={`block truncate ${nested ? 'text-sm' : 'font-semibold'} text-on-surface`}>
            {label}
          </span>
          <span className="block text-xs text-on-surface-variant">
            {currentLimit !== null ? (
              <>
                {formatINR(currentLimit)}/mo
                {current?.mode === 'percent' ? ` · ${current.percent}% of last month` : ''}
              </>
            ) : (
              'No budget set'
            )}
          </span>
        </span>
        <span
          className="material-symbols-outlined text-on-surface-variant shrink-0 transition-transform"
          style={{ transform: open ? 'rotate(180deg)' : 'none' }}
          aria-hidden="true"
        >
          expand_more
        </span>
      </button>

      {open && (
        <div className="px-3 pb-3 flex flex-col gap-3" data-testid={`${testIdPrefix}-editor`}>
          {/* Mode toggle. */}
          <div className="flex bg-surface-container-low rounded-full p-1 border border-outline-variant/20 self-start">
            <button
              type="button"
              onClick={() => {
                setMode('amount');
                setError(null);
                setSaved(false);
              }}
              aria-pressed={mode === 'amount'}
              data-testid={`${testIdPrefix}-mode-amount`}
              className={`px-4 py-1.5 rounded-full text-[11px] font-label-caps uppercase tracking-wider transition-all ${
                mode === 'amount'
                  ? 'bg-primary-container text-on-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Amount
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('percent');
                setError(null);
                setSaved(false);
              }}
              aria-pressed={mode === 'percent'}
              data-testid={`${testIdPrefix}-mode-percent`}
              className={`px-4 py-1.5 rounded-full text-[11px] font-label-caps uppercase tracking-wider transition-all ${
                mode === 'percent'
                  ? 'bg-primary-container text-on-primary font-bold'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              Percent
            </button>
          </div>

          <div className="flex flex-wrap items-end gap-2">
            <div className="relative flex-1 min-w-[10rem]">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-primary-container font-semibold">
                {mode === 'amount' ? '₹' : '%'}
              </span>
              <input
                type="number"
                inputMode="decimal"
                min={0}
                step={mode === 'amount' ? '1' : '0.1'}
                value={value}
                onChange={(e) => {
                  setValue(e.target.value);
                  if (error) setError(null);
                  if (saved) setSaved(false);
                }}
                disabled={busy}
                placeholder={mode === 'amount' ? '5000' : '90'}
                aria-invalid={error !== null}
                aria-label={`${label} budget value`}
                data-testid={`${testIdPrefix}-input`}
                className={`${CONTROL_CLASS} w-full pl-8`}
              />
            </div>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={busy}
              data-testid={`${testIdPrefix}-save`}
              className="btn-primary px-4 py-2 text-sm flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-base" aria-hidden="true">
                check
              </span>
              Save
            </button>
            {current !== null && (
              <button
                type="button"
                onClick={() => void handleClear()}
                disabled={busy}
                data-testid={`${testIdPrefix}-clear`}
                className="btn-ghost px-3 py-2 text-sm text-on-surface-variant hover:text-error"
              >
                Clear
              </button>
            )}
          </div>

          {previewLimit !== null && (
            <p className="text-xs text-on-surface-variant" data-testid={`${testIdPrefix}-preview`}>
              {mode === 'percent' && previousTotal <= 0 ? (
                <>No spend last month yet — the {value}% cap activates once there's a prior month.</>
              ) : (
                <>
                  Limit for {monthKey}:{' '}
                  <span className="text-on-surface font-semibold">{formatINR(previewLimit)}</span>
                  {mode === 'percent' && <> ({value}% of {formatINR(previousTotal)})</>}
                </>
              )}
            </p>
          )}
          {error !== null && (
            <p role="alert" className="text-error text-xs" data-testid={`${testIdPrefix}-error`}>
              {error}
            </p>
          )}
          {saved && (
            <p role="status" className="text-primary-container text-xs">
              Saved.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
