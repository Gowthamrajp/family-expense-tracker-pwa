/**
 * Expense entry screen (Req 3.1–3.12).
 *
 * `ExpenseEntryForm` is the guarded screen that records a single Expense. It:
 *
 * - renders a controlled form with a required amount field, a required Category
 *   selection populated from the FAMILY's Categories (Req 3.1, 4.6), a required
 *   Source selection, an OPTIONAL SubSource selection shown only when the
 *   chosen Source has at least one SubSource defined for the family (Req 3.7),
 *   an optional date field, and an optional description field accepting 0–280
 *   characters (Req 3.1);
 * - validates each field on submit: amount via {@link validateAmount} (Req 3.4),
 *   a required Category selection (Req 3.5), a required Source selection
 *   (Req 3.6), the date via {@link validateDate} where an empty date defaults to
 *   today (Req 3.9) and an out-of-range date is rejected (Req 3.10), and the
 *   description via {@link validateDescription}. Per-field inline messages are
 *   surfaced and nothing is stored while any field is invalid;
 * - on a valid submission, assembles an {@link ExpenseInput} carrying the
 *   selected `categoryId` (Req 3.2) and, when chosen, a `subSourceId` reference
 *   (Req 3.8), then persists it via {@link expenseRepository.addExpense}
 *   attributed to the current member from {@link useAuth}. The write is wrapped
 *   in a 10-second timeout: if it does not complete in time or rejects, a
 *   save-failed error is shown and all entered values are retained so the
 *   member can retry (Req 3.12);
 * - on success, shows a confirmation indication and clears all fields (Req 3.11).
 *
 * EDIT MODE (Req 3.13, 3.14, 3.16): when an `existingExpense` prop is supplied,
 * the same form runs in edit mode. It pre-populates its controlled state from
 * the stored Expense (amount, `categoryId`, source, `subSourceId`, date, and
 * description — Req 3.13), validates identically (Req 3.16), and on submit
 * calls {@link useExpenses}'s `updateExpense(existingExpense.id, input)` instead
 * of `addExpense` (Req 3.14). The optional `onSaved` callback is invoked after a
 * successful create OR update so a host (e.g. an edit modal) can close/refresh.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { expenseRepository } from '../data/expenseRepository';
import {
  MAX_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
  MIN_AMOUNT,
  MIN_DATE,
  validateAmount,
  validateDate,
  validateDescription,
  type FieldErrors,
} from '../domain/validation';
import { type Expense, type ExpenseInput, type Source } from '../domain/types';
import { useAuth } from '../state/AuthProvider';
import { useBudget } from '../state/useBudget';
import { useScopedBudgets } from '../state/useScopedBudgets';
import { useCategories } from '../state/useCategories';
import { useExpenses } from '../state/useExpenses';
import { useSources } from '../state/useSources';
import { useSubCategories } from '../state/useSubCategories';
import { useSubSources } from '../state/useSubSources';
import {
  computeBudgetStatus,
  effectiveLimit,
  effectiveMonthlyLimit,
  scopedTotalForMonth,
  type BudgetStatus,
} from '../domain/budget';
import {
  currentMonthKey,
  monthKey,
  previousMonthKey,
  totalForMonth,
} from '../domain/insights';
import { formatINR } from './Money';

/**
 * Maximum time to wait for the Data_Store write before treating the save as
 * failed and retaining the entered values (Req 3.12).
 */
export const SAVE_TIMEOUT_MS = 10_000;

/** Message shown when the save fails or does not complete in time (Req 3.12). */
const SAVE_FAILED_MESSAGE =
  'Saving the expense failed. Your entries were kept — please try again.';

/** Message shown when an expense is stored successfully (Req 3.11). */
const SAVE_SUCCESS_MESSAGE = 'Expense saved.';

/** Message shown when an edited expense is updated successfully (Req 3.14). */
const UPDATE_SUCCESS_MESSAGE = 'Changes saved.';

/** Shared classes for ghost form controls (inputs, selects, textarea). */
const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md w-full';

/**
 * Raw, controlled values captured from the form. `category` holds the selected
 * family {@link FamilyCategory} id (Req 3.2); `subSource` holds the selected
 * {@link SubSource} id, or an empty string when none is chosen (Req 3.8).
 */
interface FormState {
  amount: string;
  category: string;
  subCategory: string;
  source: string;
  subSource: string;
  date: string;
  description: string;
}

/** Empty form state used for the initial render and after a successful save. */
const EMPTY_FORM: FormState = {
  amount: '',
  category: '',
  subCategory: '',
  source: '',
  subSource: '',
  date: '',
  description: '',
};

/**
 * Build the initial create-mode form state, pre-filling the date with today so
 * the picker shows the current date by default; the member can still change it.
 */
function freshForm(): FormState {
  return { ...EMPTY_FORM, date: toDateInputValue(new Date()) };
}

/**
 * Format a stored {@link Date} as the `yyyy-mm-dd` value a native date input
 * expects. Uses local-date components (not UTC) so the populated day matches
 * the date the member originally chose regardless of timezone.
 */
function toDateInputValue(date: Date): string {
  const year = date.getFullYear().toString().padStart(4, '0');
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  return `${year}-${month}-${day}`;
}

/**
 * Build the initial controlled {@link FormState} for edit mode from a stored
 * {@link Expense} (Req 3.13). The canonical category reference is `categoryId`;
 * the amount is rendered with its stored precision and the date is formatted to
 * the date input's `yyyy-mm-dd` value. An absent `subSourceId` maps to the
 * empty "no specific card/account" selection.
 */
function formStateFromExpense(expense: Expense): FormState {
  return {
    amount: expense.amount.toString(),
    category: expense.categoryId ?? '',
    subCategory: expense.subCategoryId ?? '',
    source: expense.source,
    subSource: expense.subSourceId ?? '',
    date: toDateInputValue(expense.date),
    description: expense.description,
  };
}

/** Submission lifecycle, separate from per-field validation state. */
type SaveState =
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'success' }
  | { kind: 'error' };

/**
 * Human-readable message for an amount validation failure (Req 3.4). All
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

/** Human-readable message for a date validation failure (Req 3.10). */
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

/** Human-readable message for a description validation failure (Req 3.1). */
function descriptionErrorMessage(
  error: NonNullable<FieldErrors['description']>,
): string {
  return `Use at most ${error.max} characters (currently ${error.actual}).`;
}

/** Type guard: is `value` a non-empty source selection? */
function isSource(value: string): value is Source {
  return value !== '';
}

/**
 * Render a SubSource option label: the nickname followed by a masked last-4
 * identifier when present (Req 3.7). Never renders a full card number — only
 * the stored nickname/last-4 (Req 9.5).
 */
function subSourceLabel(nickname: string, last4?: string): string {
  return `${nickname}${last4 ? ' ••' + last4 : ''}`;
}

/**
 * Run a promise with a hard timeout. Rejects if `promise` has not settled
 * within `timeoutMs`, so a slow Data_Store write is treated as a save failure
 * (Req 3.12). The pending timer is always cleared.
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
 * Props for {@link ExpenseEntryForm}. Mirrors the design's
 * `ExpenseEntryFormProps`.
 */
interface ExpenseEntryFormProps {
  /**
   * The active family's id, used both to load the family's Categories/SubSources
   * ({@link useCategories}/{@link useSubSources}) and to scope the write via the
   * {@link useExpenses} actions. Defaults to `null` until routing wiring lands;
   * while `null` the selects are empty and a submit is treated as a save error
   * so no unscoped write is attempted.
   */
  familyId?: string | null;
  /**
   * When present, the form runs in EDIT mode (Req 3.13): it pre-populates from
   * this Expense and submits via `updateExpense(existingExpense.id, input)`
   * instead of `addExpense` (Req 3.14).
   */
  existingExpense?: Expense;
  /** Invoked after a successful create or update so a host can close/refresh. */
  onSaved?: () => void;
}

/**
 * Render the expense entry form.
 *
 * @param familyId - The active family's id (see {@link ExpenseEntryFormProps}).
 * @param existingExpense - When provided, switches the form to edit mode and
 *   pre-populates it from the stored Expense (Req 3.13).
 * @param onSaved - Called after a successful create or update.
 */
export function ExpenseEntryForm({
  familyId = null,
  existingExpense,
  onSaved,
}: ExpenseEntryFormProps = {}): JSX.Element {
  const isEditMode = existingExpense !== undefined;

  const { member } = useAuth();
  const { categories } = useCategories(familyId);
  const { forCategory, status: subCategoriesStatus } = useSubCategories(familyId);
  const { forSource, status: subSourcesStatus } = useSubSources(familyId);
  const { sources } = useSources(familyId);
  const { updateExpense, expenses } = useExpenses(familyId);
  const { budget } = useBudget(familyId, member);
  const { forCategory: budgetForCategory, forSubCategory: budgetForSubCategory } =
    useScopedBudgets(familyId, member);

  const [form, setForm] = useState<FormState>(() =>
    existingExpense !== undefined
      ? formStateFromExpense(existingExpense)
      : freshForm(),
  );
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  // Sub-category is required only when the chosen category has sub-categories;
  // tracked separately since it is not part of the shared FieldErrors type.
  const [subCategoryError, setSubCategoryError] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>({ kind: 'idle' });

  // Identifies the in-flight save so a result that arrives after a newer
  // submission (or after the timeout) is ignored.
  const saveAttemptRef = useRef(0);

  const isSaving = saveState.kind === 'saving';

  // Sub-categories available for the currently selected Category. Only a
  // non-empty category selection yields candidates.
  const subCategoryOptions = useMemo(
    () => (form.category !== '' ? forCategory(form.category) : []),
    [form.category, forCategory],
  );

  // Reset the sub-category selection when the category changes (or its
  // available sub-categories change) so a stale sub-category from a different
  // category is never submitted. In edit mode the pre-populated sub-category
  // must survive until its sub-categories have loaded, so the reset is deferred
  // while the subscription is still loading.
  useEffect(() => {
    if (subCategoriesStatus === 'loading') {
      return;
    }
    setForm((current) => {
      if (current.subCategory === '') {
        return current;
      }
      const stillValid = subCategoryOptions.some(
        (sub) => sub.id === current.subCategory,
      );
      return stillValid ? current : { ...current, subCategory: '' };
    });
  }, [subCategoryOptions, subCategoriesStatus]);

  // SubSources available for the currently selected Source (Req 3.7). Only a
  // valid Source selection yields candidates; an empty/unknown source has none.
  const subSourceOptions = useMemo(
    () => (isSource(form.source) ? forSource(form.source) : []),
    [form.source, forSource],
  );

  // Reset the SubSource selection whenever the Source changes (or its available
  // sub-sources change) so a stale sub-source from a different source is never
  // submitted (Req 3.8). In edit mode the pre-populated sub-source must survive
  // until its sub-sources have actually loaded, so the reset is deferred while
  // the sub-source subscription is still `loading` — otherwise the initial
  // empty options would wrongly clear a valid stored selection (Req 3.13).
  useEffect(() => {
    if (subSourcesStatus === 'loading') {
      return;
    }
    setForm((current) => {
      if (current.subSource === '') {
        return current;
      }
      const stillValid = subSourceOptions.some(
        (subSource) => subSource.id === current.subSource,
      );
      return stillValid ? current : { ...current, subSource: '' };
    });
  }, [subSourceOptions, subSourcesStatus]);

  const updateField = useCallback(
    <K extends keyof FormState>(key: K, value: FormState[K]) => {
      setForm((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      // Validate each field independently against "now" (an empty date resolves
      // to today — Req 3.9). Category is now a family `categoryId`, so it is
      // validated here as a required selection rather than via the legacy
      // enum-based `validateExpenseForm`.
      const errors: FieldErrors = {};

      const amountResult = validateAmount(form.amount);
      if (!amountResult.ok) {
        errors.amount = amountResult.error;
      }

      if (form.category === '') {
        // Required Category selection (Req 3.5).
        errors.category = { kind: 'required' };
      }

      // When the chosen category has sub-categories defined, selecting one is
      // mandatory (so spending is always classified to the finest level the
      // family has set up). Tracked separately from FieldErrors.
      const subCategoryRequired =
        form.category !== '' &&
        subCategoryOptions.length > 0 &&
        form.subCategory === '';
      setSubCategoryError(subCategoryRequired);

      if (!isSource(form.source)) {
        // Required Source selection (Req 3.6).
        errors.source = { kind: 'required' };
      }

      const dateResult = validateDate(form.date, new Date());
      if (!dateResult.ok) {
        errors.date = dateResult.error;
      }

      const descriptionResult = validateDescription(form.description);
      if (!descriptionResult.ok) {
        errors.description = descriptionResult.error;
      }

      if (Object.keys(errors).length > 0 || subCategoryRequired) {
        // Per-field inline messages; nothing is stored (Req 3.4, 3.5, 3.6, 3.10).
        setFieldErrors(errors);
        setSaveState({ kind: 'idle' });
        return;
      }

      setFieldErrors({});

      if (member === null || familyId === null) {
        // No active Session/resolved family to attribute the expense to: treat
        // as a save error and retain the entered values. The `familyId === null`
        // guard is a SHIM until `useFamily` supplies the id.
        setSaveState({ kind: 'error' });
        return;
      }

      // All validators succeeded; these narrow safely.
      const amount = (amountResult as { ok: true; value: number }).value;
      const source = form.source as Source;
      const date = (dateResult as { ok: true; value: Date }).value;
      const description = (descriptionResult as { ok: true; value: string })
        .value;

      // Resolve the selected category's display NAME for the legacy required
      // `category` field on ExpenseInput (a type shim until the enum is
      // removed). `categoryId` is the canonical reference going forward (Req 3.2).
      const selectedCategory = categories.find(
        (category) => category.id === form.category,
      );
      const categoryName = selectedCategory?.name ?? 'Other';

      const expenseInput: ExpenseInput = {
        amount,
        // SHIM: legacy enum field set to the selected category's name so the
        // ExpenseInput type is satisfied; `categoryId` is the real reference.
        category: categoryName as ExpenseInput['category'],
        categoryId: form.category,
        source,
        date,
        description,
      };

      // Only attach a SubSource reference when one is selected (Req 3.8); an
      // empty selection is omitted so no `undefined`/stale id is written.
      if (form.subSource !== '') {
        expenseInput.subSourceId = form.subSource;
      }

      // Attach a SubCategory reference only when one is selected under the
      // chosen category; an empty selection is omitted.
      if (form.subCategory !== '') {
        expenseInput.subCategoryId = form.subCategory;
      }

      const attemptId = saveAttemptRef.current + 1;
      saveAttemptRef.current = attemptId;
      setSaveState({ kind: 'saving' });

      try {
        // In edit mode, update the existing expense via the family-scoped hook
        // action (preserves recordedBy/createdAt, stamps updatedBy/updatedAt —
        // Req 3.14, 3.15); otherwise create a new one. Both writes share the
        // same 10-second timeout/retention behavior (Req 3.12).
        await withTimeout<void>(
          isEditMode
            ? updateExpense(existingExpense.id, expenseInput)
            : expenseRepository
                .addExpense(familyId, expenseInput, member)
                .then(() => undefined),
          SAVE_TIMEOUT_MS,
        );
        if (saveAttemptRef.current !== attemptId) {
          return;
        }
        // Success: confirm. In create mode clear every field (Req 3.11); in edit
        // mode retain the saved values so the form keeps showing what was stored.
        if (!isEditMode) {
          setForm(freshForm());
        }
        setSaveState({ kind: 'success' });
        // Notify the host (e.g. an edit modal) after a successful save.
        onSaved?.();
      } catch {
        if (saveAttemptRef.current !== attemptId) {
          return;
        }
        // Failure or timeout: show the error and retain all values (Req 3.12).
        setSaveState({ kind: 'error' });
      }
    },
    [
      form,
      member,
      familyId,
      categories,
      subCategoryOptions,
      isEditMode,
      existingExpense,
      updateExpense,
      onSaved,
    ],
  );

  const descriptionLength = useMemo(
    () => Array.from(form.description).length,
    [form.description],
  );

  // Live monthly-budget projections for the transaction being entered. Budgets
  // are rolling monthly caps applied to the CURRENT calendar month. We project
  // each applicable scope's month spend including the amount being typed — the
  // global cap, plus the selected category's and sub-category's caps when set —
  // and alert when any is crossed. Only current-month dates affect the
  // projection (empty date defaults to today).
  const budgetProjections = useMemo(() => {
    const today = new Date();
    const curKey = currentMonthKey(today);
    const prevKey = previousMonthKey(today);

    const enteredAmount = Number(form.amount);
    const enteredDate = form.date === '' ? today : new Date(form.date);
    const countsThisMonth =
      Number.isFinite(enteredAmount) &&
      enteredAmount > 0 &&
      !Number.isNaN(enteredDate.getTime()) &&
      currentMonthKey(enteredDate) === curKey;
    const addAmount = countsThisMonth ? enteredAmount : 0;

    // Exclude the expense being edited so it isn't double-counted.
    const excludeId = isEditMode ? existingExpense?.id : undefined;
    const matching = (predicate: (e: typeof expenses[number]) => boolean) =>
      expenses.filter((e) => e.id !== excludeId && predicate(e));

    type Projection = {
      key: string;
      label: string;
      limit: number;
      projected: number;
      status: BudgetStatus;
    };
    const projections: Projection[] = [];

    const pushProjection = (
      key: string,
      label: string,
      limit: number | null,
      scopePredicate: (e: typeof expenses[number]) => boolean,
    ): void => {
      if (limit === null || limit <= 0) {
        return;
      }
      const spent = scopedTotalForMonth(matching(scopePredicate), monthKey, curKey, () => true);
      const projected = spent + addAmount;
      projections.push({
        key,
        label,
        limit,
        projected,
        status: computeBudgetStatus(projected, limit),
      });
    };

    // Global cap.
    if (budget !== null) {
      const prevTotal = totalForMonth(expenses, prevKey);
      pushProjection('global', 'overall', effectiveMonthlyLimit(budget, prevTotal), () => true);
    }

    // Category cap (only when a category is selected).
    if (form.category !== '') {
      const catBudget = budgetForCategory(form.category);
      if (catBudget !== null) {
        const catName =
          categories.find((c) => c.id === form.category)?.name ?? 'this category';
        const prevCat = scopedTotalForMonth(
          expenses,
          monthKey,
          prevKey,
          (e) => e.categoryId === form.category,
        );
        pushProjection(
          'category',
          catName,
          effectiveLimit(catBudget.mode, catBudget.amount, catBudget.percent, prevCat),
          (e) => e.categoryId === form.category,
        );
      }
    }

    // Sub-category cap (only when a sub-category is selected).
    if (form.subCategory !== '') {
      const subBudget = budgetForSubCategory(form.subCategory);
      if (subBudget !== null) {
        const subName =
          subCategoryOptions.find((s) => s.id === form.subCategory)?.name ??
          'this sub-category';
        const prevSub = scopedTotalForMonth(
          expenses,
          monthKey,
          prevKey,
          (e) => e.subCategoryId === form.subCategory,
        );
        pushProjection(
          'subCategory',
          subName,
          effectiveLimit(subBudget.mode, subBudget.amount, subBudget.percent, prevSub),
          (e) => e.subCategoryId === form.subCategory,
        );
      }
    }

    return projections;
  }, [
    budget,
    budgetForCategory,
    budgetForSubCategory,
    expenses,
    form.amount,
    form.date,
    form.category,
    form.subCategory,
    categories,
    subCategoryOptions,
    isEditMode,
    existingExpense,
  ]);

  return (
    <div className="p-5 md:px-container_padding md:py-8 flex justify-center">
      <form
        onSubmit={handleSubmit}
        noValidate
        className="glass-card p-card_padding w-full max-w-xl flex flex-col gap-5"
      >
        <h1 className="text-headline-lg font-bold text-on-surface">
          {isEditMode ? 'Edit expense' : 'Add expense'}
        </h1>

        {/* Amount: required, numeric, 0.01..999,999,999.99, <= 2 decimals (Req 3.1, 3.4). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-amount" className="text-sm text-on-surface-variant">
            Amount
          </label>
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
            className={CONTROL_CLASS}
          />
          {fieldErrors.amount !== undefined && (
            <span id="expense-amount-error" role="alert" className="text-error text-sm">
              {amountErrorMessage(fieldErrors.amount)}
            </span>
          )}
        </div>

        {/* Monthly budget alerts + contextual progress (Req: alert while adding
            a transaction when a budget is crossed). One block per applicable
            scope — overall, the selected category, and its sub-category — that
            has a usable monthly limit. */}
        {budgetProjections.length > 0 && (
          <div className="flex flex-col gap-3" data-testid="budget-alert-block">
            {budgetProjections.map((proj) => {
              const over = proj.status.state === 'over';
              const warning = proj.status.state === 'warning';
              const scopeLabel =
                proj.key === 'global' ? 'overall budget' : `${proj.label} budget`;
              return (
                <div
                  key={proj.key}
                  className="flex flex-col gap-2"
                  data-testid={`budget-alert-${proj.key}`}
                >
                  {over && (
                    <div
                      role="alert"
                      data-testid={`budget-alert-${proj.key}-over`}
                      className="bg-error-container/20 border border-error/30 rounded-xl p-4 flex items-start gap-3"
                    >
                      <span
                        className="material-symbols-outlined text-error mt-0.5"
                        aria-hidden="true"
                        style={{ fontVariationSettings: "'FILL' 1" }}
                      >
                        warning
                      </span>
                      <div className="flex-1 text-sm">
                        <p className="text-on-surface font-semibold">
                          Over {scopeLabel}
                        </p>
                        <p className="text-on-surface-variant mt-0.5">
                          This puts the {scopeLabel}{' '}
                          <span className="text-error font-bold">
                            {formatINR(proj.projected - proj.limit)}
                          </span>{' '}
                          over its {formatINR(proj.limit)} cap this month.
                        </p>
                      </div>
                    </div>
                  )}
                  {warning && (
                    <div
                      role="alert"
                      data-testid={`budget-alert-${proj.key}-warning`}
                      className="bg-amber-400/10 border border-amber-400/30 rounded-xl p-4 flex items-start gap-3"
                    >
                      <span className="material-symbols-outlined text-amber-400 mt-0.5" aria-hidden="true">
                        warning
                      </span>
                      <div className="flex-1 text-sm">
                        <p className="text-on-surface font-semibold">
                          Approaching {scopeLabel}
                        </p>
                        <p className="text-on-surface-variant mt-0.5">
                          This will use{' '}
                          <span className="text-amber-400 font-bold">
                            {proj.status.fraction !== null
                              ? `${(proj.status.fraction * 100).toFixed(0)}%`
                              : ''}
                          </span>{' '}
                          of the {formatINR(proj.limit)} {scopeLabel}.
                        </p>
                      </div>
                    </div>
                  )}
                  {/* Contextual monthly progress bar for this scope. */}
                  <div className="bg-surface-container-low/50 p-4 rounded-xl border border-outline-variant/10 flex flex-col gap-2">
                    <div className="flex justify-between items-end gap-3">
                      <span className="text-label-caps uppercase text-on-surface-variant text-[11px]">
                        {proj.key === 'global'
                          ? 'Overall monthly budget'
                          : `${proj.label} budget`}
                      </span>
                      <span className="font-mono-data text-sm text-on-surface">
                        {formatINR(proj.projected)}{' '}
                        <span className="text-on-surface-variant">
                          / {formatINR(proj.limit)}
                        </span>
                      </span>
                    </div>
                    <div className="h-2 w-full rounded-full bg-surface-container-highest overflow-hidden">
                      <div
                        data-testid={`budget-alert-${proj.key}-bar`}
                        className={`h-full rounded-full transition-[width] duration-300 ${
                          over
                            ? 'bg-error'
                            : warning
                              ? 'bg-amber-400'
                              : 'bg-primary-container'
                        }`}
                        style={{
                          width: `${
                            proj.status.fraction === null
                              ? 0
                              : Math.min(proj.status.fraction * 100, 100)
                          }%`,
                        }}
                      />
                    </div>
                    <p className="text-[11px] text-on-surface-variant text-right">
                      {proj.status.remaining !== null && proj.status.remaining >= 0
                        ? `Remaining: ${formatINR(proj.status.remaining)}`
                        : `Over by: ${formatINR(proj.projected - proj.limit)}`}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Category: required selection populated from the family's categories (Req 3.1, 3.5, 4.6). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-category" className="text-sm text-on-surface-variant">
            Category
          </label>
          <select
            id="expense-category"
            name="category"
            value={form.category}
            onChange={(event) => {
              updateField('category', event.target.value);
              // Changing the category invalidates any prior sub-category error.
              if (subCategoryError) {
                setSubCategoryError(false);
              }
            }}
            disabled={isSaving}
            aria-invalid={fieldErrors.category !== undefined}
            aria-describedby={
              fieldErrors.category !== undefined
                ? 'expense-category-error'
                : undefined
            }
            className={CONTROL_CLASS}
          >
            <option value="">Select a category</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </select>
          {fieldErrors.category !== undefined && (
            <span id="expense-category-error" role="alert" className="text-error text-sm">
              Select a category.
            </span>
          )}
        </div>

        {/* Sub-category: required when the selected Category has at least one
            sub-category defined for the family; hidden otherwise. */}
        {subCategoryOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-subcategory" className="text-sm text-on-surface-variant">
              Sub-category
            </label>
            <select
              id="expense-subcategory"
              name="subCategory"
              value={form.subCategory}
              onChange={(event) => {
                updateField('subCategory', event.target.value);
                if (subCategoryError) {
                  setSubCategoryError(false);
                }
              }}
              disabled={isSaving}
              aria-invalid={subCategoryError}
              aria-describedby={
                subCategoryError ? 'expense-subcategory-error' : undefined
              }
              className={CONTROL_CLASS}
            >
              <option value="">Select a sub-category</option>
              {subCategoryOptions.map((sub) => (
                <option key={sub.id} value={sub.id}>
                  {sub.name}
                </option>
              ))}
            </select>
            {subCategoryError && (
              <span id="expense-subcategory-error" role="alert" className="text-error text-sm">
                Select a sub-category.
              </span>
            )}
          </div>
        )}

        {/* Source: required selection (Req 3.1, 3.6). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-source" className="text-sm text-on-surface-variant">
            Source
          </label>
          <select
            id="expense-source"
            name="source"
            value={form.source}
            onChange={(event) => updateField('source', event.target.value)}
            disabled={isSaving}
            aria-invalid={fieldErrors.source !== undefined}
            aria-describedby={
              fieldErrors.source !== undefined ? 'expense-source-error' : undefined
            }
            className={CONTROL_CLASS}
          >
            <option value="">Select a source</option>
            {sources.map((source) => (
              <option key={source.id} value={source.name}>
                {source.name}
              </option>
            ))}
          </select>
          {fieldErrors.source !== undefined && (
            <span id="expense-source-error" role="alert" className="text-error text-sm">
              Select a source.
            </span>
          )}
        </div>

        {/* SubSource: optional; shown only when the selected Source has at least
            one SubSource for the family (Req 3.7, 3.8). */}
        {subSourceOptions.length > 0 && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="expense-subsource" className="text-sm text-on-surface-variant">
              Card/account (optional)
            </label>
            <select
              id="expense-subsource"
              name="subSource"
              value={form.subSource}
              onChange={(event) => updateField('subSource', event.target.value)}
              disabled={isSaving}
              className={CONTROL_CLASS}
            >
              <option value="">No specific card/account</option>
              {subSourceOptions.map((subSource) => (
                <option key={subSource.id} value={subSource.id}>
                  {subSourceLabel(subSource.nickname, subSource.last4)}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Date: optional; empty defaults to today (Req 3.1, 3.9, 3.10). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-date" className="text-sm text-on-surface-variant">
            Date <span className="text-on-surface-variant/60">(defaults to today)</span>
          </label>
          <input
            id="expense-date"
            name="date"
            type="date"
            min={MIN_DATE}
            value={form.date}
            onChange={(event) => updateField('date', event.target.value)}
            disabled={isSaving}
            aria-invalid={fieldErrors.date !== undefined}
            aria-describedby={
              fieldErrors.date !== undefined ? 'expense-date-error' : undefined
            }
            className={`${CONTROL_CLASS} [color-scheme:dark]`}
          />
          {fieldErrors.date !== undefined && (
            <span id="expense-date-error" role="alert" className="text-error text-sm">
              {dateErrorMessage(fieldErrors.date)}
            </span>
          )}
        </div>

        {/* Description: optional, 0..280 characters (Req 3.1). */}
        <div className="flex flex-col gap-1.5">
          <label htmlFor="expense-description" className="text-sm text-on-surface-variant">
            Description
          </label>
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
            className={`${CONTROL_CLASS} resize-y`}
          />
          <span className="text-xs text-on-surface-variant self-end">
            {descriptionLength}/{MAX_DESCRIPTION_LENGTH}
          </span>
          {fieldErrors.description !== undefined && (
            <span
              id="expense-description-error"
              role="alert"
              className="text-error text-sm"
            >
              {descriptionErrorMessage(fieldErrors.description)}
            </span>
          )}
        </div>

        {/* Save-failed error; entered values are retained (Req 3.12). */}
        {saveState.kind === 'error' && (
          <p role="alert" className="text-error text-sm">
            {SAVE_FAILED_MESSAGE}
          </p>
        )}

        {/* Success confirmation; fields are cleared on success (Req 3.11). */}
        {saveState.kind === 'success' && (
          <p role="status" aria-live="polite" className="text-primary-container text-sm">
            {isEditMode ? UPDATE_SUCCESS_MESSAGE : SAVE_SUCCESS_MESSAGE}
          </p>
        )}

        <button
          type="submit"
          disabled={isSaving}
          aria-busy={isSaving}
          className="btn-primary px-5 py-3 self-start flex items-center gap-2"
        >
          <span className="material-symbols-outlined text-lg" aria-hidden="true">
            save
          </span>
          {isSaving
            ? 'Saving…'
            : isEditMode
              ? 'Save changes'
              : 'Save expense'}
        </button>
      </form>
    </div>
  );
}
