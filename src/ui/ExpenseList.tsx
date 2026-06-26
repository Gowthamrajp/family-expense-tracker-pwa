/**
 * Expense list screen (Req 3.1–3.9, 6.1–6.3).
 *
 * `ExpenseList` renders the family group's recorded expenses, retrieved live
 * via {@link useExpenses}. The hook subscribes to the Firestore real-time
 * listener while a Session is active, returns the data already ordered by
 * Expense date most-recent first (Req 3.4, 6.1), and surfaces
 * loading/ready/error status with a `retry` control.
 *
 * Each stored expense references its Category and (optionally) SubSource by id;
 * the family's {@link useCategories} and {@link useSubSources} subscriptions
 * supply the lookup data so {@link resolveLabels} can project each expense into
 * a display-ready {@link ExpenseRow} with the resolved Category name, the
 * SubSource nickname when present, and the denormalized recording member
 * (Req 6.2, 6.3).
 *
 * Behavior by status (driven by the expense subscription):
 *
 * - `loading` — show a loading indicator until retrieval completes or fails
 *   (Req 3.7).
 * - `ready` with expenses — render the ordered list; each row shows the
 *   monetary amount, Category name, Source name, SubSource nickname when
 *   present, the recording Family_Member, Expense date, and description text,
 *   leaving the description blank when empty (Req 6.2, 6.3). New expenses
 *   stored during the Session appear without a manual reload because the hook
 *   stays subscribed (Req 3.5).
 * - `ready` with no expenses — show an empty-state message (Req 3.6).
 * - `error` — show an error message plus a retry control that re-attempts the
 *   retrieval via `retry()`; any previously displayed data is retained by the
 *   hook (Req 3.8, 3.9).
 *
 * Each row also exposes per-row Edit and Delete affordances available on every
 * row regardless of who recorded the expense (Req 3.19). Edit opens
 * {@link ExpenseEntryForm} in edit mode inside a glass-card modal/overlay,
 * seeding it with the original {@link Expense}; a successful update closes the
 * overlay via `onSaved` and the live subscription reflects the change
 * (Req 3.13). Delete uses an inline confirmation prompt and, on confirm, calls
 * `deleteExpense(expenseId)` from {@link useExpenses}; the live subscription
 * removes the row (Req 3.17, 3.18).
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { useExpenses } from '../state/useExpenses';
import { useIncome } from '../state/useIncome';
import { useCategories } from '../state/useCategories';
import { useSubCategories } from '../state/useSubCategories';
import { useSubSources } from '../state/useSubSources';
import { resolveLabels, type ExpenseRow } from '../domain/expenseMapper';
import { SOURCES, type Expense, type Income, type Source } from '../domain/types';
import { ExpenseEntryForm } from './ExpenseEntryForm';
import { IncomeEntryForm } from './IncomeEntryForm';
import { Money } from './Money';
import { Loader } from './Loader';

/** Message shown when no transactions exist for the family group. */
const EMPTY_STATE_MESSAGE = 'No transactions have been recorded yet.';

/** Message shown when the transaction list could not be loaded (Req 3.8). */
const LOAD_ERROR_MESSAGE = 'Transactions could not be loaded.';

/**
 * Format a monetary amount as currency for display.
 *
 * Uses INR as the MVP's single currency (multi-currency is out of scope).
 * The `en-IN` locale renders the rupee symbol with Indian digit grouping
 * (e.g. ₹1,00,000.00).
 */
const currencyFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
});

function formatAmount(amount: number): string {
  return currencyFormatter.format(amount);
}

/**
 * Format an Expense date readably (e.g. "Jan 5, 2025").
 */
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
});

function formatDate(date: Date): string {
  return dateFormatter.format(date);
}

/**
 * Map a few common category names to Material Symbols icons; fall back to a
 * generic category icon. Purely presentational — does not affect data.
 */
const CATEGORY_ICONS: ReadonlyArray<[RegExp, string]> = [
  [/grocer|food|supermarket/i, 'shopping_basket'],
  [/dining|restaurant|eat/i, 'restaurant'],
  [/transport|fuel|gas|car|travel/i, 'directions_car'],
  [/rent|hous|mortgage|utilit/i, 'home'],
  [/health|medical|pharm/i, 'medical_services'],
  [/leisure|entertain|movie|fun/i, 'movie'],
  [/shop|cloth|retail/i, 'shopping_bag'],
  [/bill|subscription|electric|water/i, 'receipt'],
  [/educat|school|tuition/i, 'school'],
  [/wellness|fitness|gym/i, 'fitness_center'],
];

function categoryIcon(categoryName: string): string {
  for (const [pattern, icon] of CATEGORY_ICONS) {
    if (pattern.test(categoryName)) {
      return icon;
    }
  }
  return 'category';
}

/**
 * Map common payment-source names to Material Symbols icons; fall back to a
 * generic wallet icon. Auto-derived from the name (not stored).
 */
const SOURCE_ICONS: ReadonlyArray<[RegExp, string]> = [
  [/cash/i, 'payments'],
  [/credit|debit|card/i, 'credit_card'],
  [/reward|point/i, 'stars'],
  [/coupon|voucher/i, 'confirmation_number'],
  [/cashback/i, 'savings'],
  [/bank|account|upi|gpay|pay/i, 'account_balance'],
  [/wallet/i, 'account_balance_wallet'],
];

function sourceIcon(sourceName: string): string {
  for (const [pattern, icon] of SOURCE_ICONS) {
    if (pattern.test(sourceName)) {
      return icon;
    }
  }
  return 'account_balance_wallet';
}

/** Props for {@link IncomeListRow}. */
interface IncomeListRowProps {
  income: Income;
  onEdit: (income: Income) => void;
  onDelete: (incomeId: string) => Promise<void>;
}

/**
 * Render a single income record as a transaction row. Visually distinct from
 * expenses: a green down-arrow chip and a green amount, signalling money IN.
 */
function IncomeListRow({ income, onEdit, onDelete }: IncomeListRowProps): JSX.Element {
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(income.id);
    } finally {
      setIsDeleting(false);
      setIsConfirming(false);
    }
  }, [income.id, onDelete]);

  return (
    <li
      data-testid="transaction-row-income"
      className="glass-card glass-card-hover p-3 md:p-4 flex items-center gap-3 md:gap-4"
    >
      {/* Income chip: green down-arrow signalling money in. */}
      <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg bg-emerald-400/10 flex items-center justify-center text-emerald-400">
        <span className="material-symbols-outlined text-[20px] md:text-2xl" aria-hidden="true">
          arrow_downward
        </span>
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 min-w-0">
          <span className="font-semibold text-on-surface truncate">{income.source}</span>
          <span className="text-[10px] uppercase tracking-wide text-emerald-400 bg-emerald-400/10 px-1.5 py-0.5 rounded-full shrink-0">
            Income
          </span>
        </div>
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-on-surface-variant mt-0.5">
          <span className="opacity-70 italic">{income.recordedByName ?? 'Member'}</span>
          {income.description.trim() !== '' && (
            <>
              <span aria-hidden="true">·</span>
              <span className="truncate">{income.description}</span>
            </>
          )}
        </div>
      </div>

      <div className="text-right shrink-0">
        <Money
          amount={income.amount}
          className="block font-mono-data text-base md:text-lg font-semibold text-emerald-400"
        />
        <span className="block text-[11px] md:text-xs text-on-surface-variant mt-0.5">
          {formatDate(income.date)}
        </span>
      </div>

      <div className="shrink-0 flex items-center gap-1">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
              aria-busy={isDeleting}
              data-testid="income-delete-confirm"
              className="btn-ghost px-2.5 py-1 text-xs text-error"
            >
              {isDeleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(income)}
              aria-label={`Edit income ${income.source}`}
              data-testid="income-edit"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              aria-label={`Delete income ${income.source}`}
              data-testid="income-delete"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/** Props for {@link ExpenseListRow}. */
interface ExpenseListRowProps {
  /** Display-ready projection used to render the row's labels (Req 6.2, 6.3). */
  row: ExpenseRow;
  /**
   * The original stored {@link Expense}, threaded through alongside its
   * projected {@link ExpenseRow} so the Edit affordance can open the entry form
   * in edit mode with the full record (id, `categoryId`, source, `subSourceId`,
   * date, etc. — Req 3.13).
   */
  expense: Expense;
  /** Open the edit modal for this expense (Req 3.13). */
  onEdit: (expense: Expense) => void;
  /**
   * Delete this expense after confirmation (Req 3.17, 3.18). Returns the
   * delete promise so the row can show an in-flight state.
   */
  onDelete: (expenseId: string) => Promise<void>;
  /** Open the details drawer for this expense. */
  onSelect: (expense: Expense) => void;
}

/**
 * Render a single resolved expense as a glass-card row showing a category icon
 * chip, amount, Category name, Source name, SubSource nickname (when present),
 * recording member, date, and description (blank when empty), plus per-row Edit
 * and Delete affordances.
 *
 * The Edit control opens the entry form in edit mode for the original Expense
 * (Req 3.13). The Delete control uses an inline confirmation prompt — matching
 * the dark FamilyVault styling used by the category/sub-source managers — and
 * calls back to remove the expense on confirm (Req 3.17, 3.18). Both controls
 * appear on every row regardless of who recorded the expense (Req 3.19).
 *
 * Validates: Requirements 3.13, 3.17, 3.18, 3.19, 6.2, 6.3
 */
function ExpenseListRow({
  row,
  expense,
  onEdit,
  onDelete,
  onSelect,
}: ExpenseListRowProps): JSX.Element {
  const {
    amount,
    categoryName,
    sourceName,
    subSourceNickname,
    subCategoryName,
    recordedByName,
    date,
    description,
  } = row;

  // Inline delete-confirmation state, mirroring the category/sub-source manager
  // pattern (Req 3.17). `isConfirming` swaps the trash icon for Confirm/Cancel
  // controls; `isDeleting` reflects the in-flight delete.
  const [isConfirming, setIsConfirming] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleConfirmDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      // The live subscription removes the row on success, so there is no local
      // success state to manage here (Req 3.18).
      await onDelete(expense.id);
    } finally {
      // If the delete failed the row is still present; drop the in-flight flag
      // and close the confirm prompt so the member can retry.
      setIsDeleting(false);
      setIsConfirming(false);
    }
  }, [expense.id, onDelete]);

  return (
    <li
      data-testid="expense-row"
      className="glass-card glass-card-hover p-3 md:p-4 flex items-center gap-3 md:gap-4"
    >
      {/* Category icon chip. */}
      <div className="shrink-0 w-10 h-10 md:w-12 md:h-12 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
        <span className="material-symbols-outlined text-[20px] md:text-2xl" aria-hidden="true">
          {categoryIcon(categoryName)}
        </span>
      </div>

      {/* Primary info: category, sub-category, source/sub-source, description.
          Clicking opens the details drawer. */}
      <button
        type="button"
        onClick={() => onSelect(expense)}
        data-testid="expense-open-details"
        aria-label={`View details for ${categoryName} ${formatAmount(amount)}`}
        className="flex-1 min-w-0 text-left"
      >
        {/* Line 1: category name + optional sub-category chip. */}
        <div className="flex items-center gap-1.5 min-w-0">
          <span data-testid="expense-category" className="font-semibold text-on-surface truncate">
            {subCategoryName ?? categoryName}
          </span>
        </div>
        {/* Line 2: source icon + (sub-source name, else source name) + recorder. */}
        <div className="flex items-center gap-1.5 flex-wrap text-xs text-on-surface-variant mt-0.5">
          <span data-testid="expense-source" className="inline-flex items-center gap-1">
            <span
              className="material-symbols-outlined text-[15px]"
              aria-hidden="true"
              title={sourceName}
            >
              {sourceIcon(sourceName)}
            </span>
            <span data-testid="expense-subsource" className="truncate">
              {subSourceNickname ?? sourceName}
            </span>
          </span>
          <span data-testid="expense-recordedby" className="opacity-70 italic">
            · {recordedByName}
          </span>
        </div>
        {/* Line 3: description, only when present. */}
        {description.trim() !== '' && (
          <span
            data-testid="expense-description"
            className="block text-sm text-on-surface-variant mt-0.5 truncate"
          >
            {description}
          </span>
        )}
      </button>

      {/* Amount + date, right aligned. */}
      <div className="text-right shrink-0">
        <Money
          amount={amount}
          testId="expense-amount"
          className="block font-mono-data text-base md:text-lg font-semibold text-white"
        />
        <span data-testid="expense-date" className="block text-[11px] md:text-xs text-on-surface-variant mt-0.5">
          {formatDate(date)}
        </span>
      </div>

      {/*
        Per-row Edit/Delete affordances (Req 3.13, 3.17, 3.18, 3.19). Hidden on
        phones to keep the row uncramped — tapping the row opens the details
        drawer, which has Edit/Delete. Shown inline from md upward.
      */}
      <div className="shrink-0 hidden md:flex items-center gap-1">
        {isConfirming ? (
          <>
            <button
              type="button"
              onClick={() => void handleConfirmDelete()}
              disabled={isDeleting}
              aria-busy={isDeleting}
              data-testid="expense-delete-confirm"
              className="btn-ghost px-2.5 py-1 text-xs text-error"
            >
              {isDeleting ? 'Deleting…' : 'Confirm'}
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(false)}
              disabled={isDeleting}
              data-testid="expense-delete-cancel"
              className="btn-ghost px-2.5 py-1 text-xs"
            >
              Cancel
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              onClick={() => onEdit(expense)}
              aria-label={`Edit expense ${categoryName} ${formatAmount(amount)}`}
              data-testid="expense-edit"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                edit
              </span>
            </button>
            <button
              type="button"
              onClick={() => setIsConfirming(true)}
              aria-label={`Delete expense ${categoryName} ${formatAmount(amount)}`}
              data-testid="expense-delete"
              className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                delete
              </span>
            </button>
          </>
        )}
      </div>
    </li>
  );
}

/**
 * Render the recorded-expense list with loading, empty, and error states.
 *
 * @param familyId - The active family's id, forwarded to {@link useExpenses},
 *   {@link useCategories}, and {@link useSubSources} so the rendered rows can
 *   resolve Category/SubSource ids to display labels. Defaults to `null` until
 *   the `FamilyProvider`/routing wiring lands (tasks 28.4/31), at which point
 *   the active family id is passed in.
 * @param active - Whether a Session is active; forwarded to {@link useExpenses}.
 *   Defaults to `true` (the hook's own default), matching the guarded route
 *   where this screen is only mounted within an active Session.
 *
 * Validates: Requirements 3.1, 3.2, 3.3, 3.4, 3.5, 3.6, 3.7, 3.8, 3.9, 3.13, 3.17, 3.18, 3.19, 6.1, 6.2, 6.3
 */
export function ExpenseList({
  familyId = null,
  active = true,
}: { familyId?: string | null; active?: boolean } = {}): JSX.Element {
  // SHIM (tasks 28.4/31): `familyId` defaults to `null` so the hooks stay idle
  // until `useFamily` supplies the active family id.
  const { expenses, status, retry, deleteExpense } = useExpenses(familyId, active);
  const { incomes, deleteIncome } = useIncome(familyId, active);

  // Family categories and sub-sources supply the lookup data used to resolve
  // each expense's stored `categoryId`/`subSourceId` references to display
  // labels (Req 6.2, 6.3). Their own loading/error status does not gate the
  // expense list: `resolveLabels` falls back to the legacy `category` string
  // and omits the sub-source nickname when the lookup data is unavailable.
  const { categories } = useCategories(familyId);
  const { subCategories } = useSubCategories(familyId);
  const { subSources } = useSubSources(familyId);

  // The expense currently open in the edit modal, or `null` when no modal is
  // shown (Req 3.13). Holds the original {@link Expense} so the entry form can
  // pre-populate from the full stored record.
  const [editing, setEditing] = useState<Expense | null>(null);
  // The income currently open in the edit modal, or `null` when none.
  const [editingIncome, setEditingIncome] = useState<Income | null>(null);

  // The expense whose details drawer is open, or `null` when closed.
  const [selected, setSelected] = useState<Expense | null>(null);

  // Filter controls: free-text search, source filter, category filter, and the
  // transaction type (expense/income/all).
  const [searchText, setSearchText] = useState('');
  const [sourceFilter, setSourceFilter] = useState<Source | 'all'>('all');
  const [categoryFilter, setCategoryFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<'all' | 'expense' | 'income'>('all');

  // Close the edit modal / details drawer on Escape so overlays are
  // keyboard-dismissible.
  useEffect(() => {
    if (editing === null && selected === null && editingIncome === null) {
      return;
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setEditing(null);
        setSelected(null);
        setEditingIncome(null);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editing, selected, editingIncome]);

  // Project each expense into a display-ready row with resolved labels, keeping
  // the original {@link Expense} alongside so the row's Edit affordance can open
  // the entry form in edit mode (Req 3.13). Kept inline (cheap, recomputed per
  // snapshot) so rows always reflect the latest expense, category, and
  // sub-source data delivered by the live subscriptions.
  const allEntries = expenses.map((expense) => ({
    expense,
    row: resolveLabels(expense, categories, subSources, subCategories),
  }));

  // Build one chronologically-sorted timeline mixing expenses and income, then
  // apply the search/filter controls. Each item is tagged by `kind` so the
  // renderer can pick the right row. Income matches search on its source/note/
  // recorder; the source/category selects only constrain expenses (income has
  // no managed source/category), so selecting either hides income.
  const timeline = useMemo(() => {
    const needle = searchText.trim().toLowerCase();

    type Item =
      | { kind: 'expense'; date: Date; expense: Expense; row: ExpenseRow }
      | { kind: 'income'; date: Date; income: Income };

    const items: Item[] = [];

    if (typeFilter !== 'income') {
      for (const entry of allEntries) {
        const { row } = entry;
        if (sourceFilter !== 'all' && row.sourceName !== sourceFilter) continue;
        if (categoryFilter !== 'all' && row.categoryName !== categoryFilter) continue;
        if (needle !== '') {
          const haystack = [
            row.description,
            row.categoryName,
            row.sourceName,
            row.subSourceNickname ?? '',
            row.recordedByName ?? '',
          ]
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) continue;
        }
        items.push({ kind: 'expense', date: entry.expense.date, expense: entry.expense, row });
      }
    }

    // Income is included only when not filtering by a managed source/category
    // (those don't apply to income) and the type filter allows it.
    if (typeFilter !== 'expense' && sourceFilter === 'all' && categoryFilter === 'all') {
      for (const income of incomes) {
        if (needle !== '') {
          const haystack = [income.source, income.description, income.recordedByName ?? '']
            .join(' ')
            .toLowerCase();
          if (!haystack.includes(needle)) continue;
        }
        items.push({ kind: 'income', date: income.date, income });
      }
    }

    // Most-recent first; stable for equal dates.
    items.sort((a, b) => b.date.getTime() - a.date.getTime());
    return items;
  }, [allEntries, incomes, searchText, sourceFilter, categoryFilter, typeFilter]);

  const isFiltering =
    searchText.trim() !== '' ||
    sourceFilter !== 'all' ||
    categoryFilter !== 'all' ||
    typeFilter !== 'all';

  return (
    <section
      data-screen="expenses"
      aria-label="Recorded expenses"
      className="p-5 md:px-container_padding md:py-8 flex flex-col gap-grid_gap"
    >
      <h1 className="text-headline-lg font-bold text-on-surface">Transactions</h1>

      {/* Search + filter bar (transaction history). */}
      {(status !== 'loading' || allEntries.length > 0 || incomes.length > 0) && (
        <div className="glass-card p-4 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant text-base" aria-hidden="true">
              search
            </span>
            <input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search transactions…"
              aria-label="Search transactions"
              data-testid="expense-search"
              className="ghost-input w-full py-2.5 pl-10 pr-4 text-body-md"
            />
          </div>
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'all' | 'expense' | 'income')}
            aria-label="Filter by type"
            data-testid="expense-filter-type"
            className="ghost-input px-3 py-2.5 text-sm flex-1 min-w-[8rem] sm:flex-none"
          >
            <option value="all">All types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
          </select>
          <select
            value={sourceFilter}
            onChange={(e) => setSourceFilter(e.target.value as Source | 'all')}
            aria-label="Filter by source"
            data-testid="expense-filter-source"
            className="ghost-input px-3 py-2.5 text-sm flex-1 min-w-[8rem] sm:flex-none"
          >
            <option value="all">All sources</option>
            {SOURCES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <select
            value={categoryFilter}
            onChange={(e) => setCategoryFilter(e.target.value)}
            aria-label="Filter by category"
            data-testid="expense-filter-category"
            className="ghost-input px-3 py-2.5 text-sm flex-1 min-w-[8rem] sm:flex-none"
          >
            <option value="all">All categories</option>
            {categories.map((c) => (
              <option key={c.id} value={c.name}>{c.name}</option>
            ))}
          </select>
          {isFiltering && (
            <button
              type="button"
              onClick={() => {
                setSearchText('');
                setSourceFilter('all');
                setCategoryFilter('all');
                setTypeFilter('all');
              }}
              className="btn-ghost px-3 py-2 text-sm"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Loading indicator while the list is being retrieved (Req 3.7). */}
      {status === 'loading' && (
        <Loader label="Loading transactions…" block testId="expense-loading" />
      )}

      {/*
        Read-error message + retry control (Req 3.8, 3.9). Previously displayed
        expenses are retained by the hook and still rendered below.
      */}
      {status === 'error' && (
        <div
          role="alert"
          className="glass-card border-error/30 p-5 flex flex-wrap items-center gap-4"
        >
          <p data-testid="expense-error" className="text-error">
            {LOAD_ERROR_MESSAGE}
          </p>
          <button
            type="button"
            onClick={retry}
            data-testid="expense-retry"
            className="btn-ghost px-4 py-2 text-sm"
          >
            Retry
          </button>
        </div>
      )}

      {/* Empty state once a successful read returns nothing, or when active
          filters match nothing. */}
      {status === 'ready' && timeline.length === 0 && (
        <div className="glass-card p-card_padding flex flex-col items-center gap-3 text-center">
          <span className="material-symbols-outlined text-primary-container text-4xl" aria-hidden="true">
            {isFiltering ? 'search_off' : 'receipt_long'}
          </span>
          <p data-testid="expense-empty" className="text-on-surface-variant text-body-lg">
            {isFiltering
              ? 'No transactions match your search or filters.'
              : EMPTY_STATE_MESSAGE}
          </p>
        </div>
      )}

      {/* Unified, date-sorted transaction list mixing expenses and income. */}
      {timeline.length > 0 && (
        <ul className="list-none m-0 p-0 flex flex-col gap-3">
          {timeline.map((item) =>
            item.kind === 'expense' ? (
              <ExpenseListRow
                key={`exp-${item.row.id}`}
                row={item.row}
                expense={item.expense}
                onEdit={setEditing}
                onDelete={deleteExpense}
                onSelect={setSelected}
              />
            ) : (
              <IncomeListRow
                key={`inc-${item.income.id}`}
                income={item.income}
                onEdit={setEditingIncome}
                onDelete={deleteIncome}
              />
            ),
          )}
        </ul>
      )}

      {/*
        Edit modal/overlay (Req 3.13). Mounts {@link ExpenseEntryForm} in edit
        mode for the selected expense; `onSaved` closes the overlay on a
        successful update and the live subscription reflects the change
        (Req 6.5). Reuses the glass-card styling so the edit experience matches
        the entry screen. The overlay is a labelled dialog and dismissible via
        its backdrop, an explicit close control, or Escape.
      */}
      {editing !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
          onClick={(event) => {
            // Dismiss only when the backdrop itself is clicked, not the dialog.
            if (event.target === event.currentTarget) {
              setEditing(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit expense"
            data-testid="expense-edit-modal"
            className="relative w-full max-w-xl my-8"
          >
            <button
              type="button"
              onClick={() => setEditing(null)}
              aria-label="Close edit form"
              data-testid="expense-edit-close"
              className="absolute right-3 top-3 z-10 btn-ghost p-1.5 text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                close
              </span>
            </button>
            <ExpenseEntryForm
              familyId={familyId}
              existingExpense={editing}
              onSaved={() => setEditing(null)}
            />
          </div>
        </div>
      )}

      {/* Details side drawer: opens when a transaction row is clicked. Shows
          the full record with Edit/Delete actions. Dismissible via backdrop,
          a close control, or Escape. */}
      {selected !== null && (
        <TransactionDetailsDrawer
          row={resolveLabels(selected, categories, subSources, subCategories)}
          expense={selected}
          onClose={() => setSelected(null)}
          onEdit={(expense) => {
            setSelected(null);
            setEditing(expense);
          }}
          onDelete={async (expenseId) => {
            await deleteExpense(expenseId);
            setSelected(null);
          }}
        />
      )}

      {/* Income edit modal: mounts the shared income form seeded with the
          selected record. */}
      {editingIncome !== null && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center overflow-y-auto bg-black/70 backdrop-blur-sm p-4"
          onClick={(event) => {
            if (event.target === event.currentTarget) {
              setEditingIncome(null);
            }
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Edit income"
            data-testid="income-edit-modal"
            className="relative w-full max-w-xl my-8"
          >
            <button
              type="button"
              onClick={() => setEditingIncome(null)}
              aria-label="Close edit form"
              className="absolute right-3 top-3 z-10 btn-ghost p-1.5 text-on-surface-variant hover:text-on-surface"
            >
              <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
            </button>
            <section className="glass-card p-card_padding flex flex-col gap-4">
              <h2 className="text-headline-md font-semibold text-on-surface">Edit income</h2>
              <IncomeEntryForm
                familyId={familyId}
                existingIncome={editingIncome}
                onSaved={() => setEditingIncome(null)}
                onCancel={() => setEditingIncome(null)}
              />
            </section>
          </div>
        </div>
      )}
    </section>
  );
}

/** Props for {@link TransactionDetailsDrawer}. */
interface TransactionDetailsDrawerProps {
  row: ExpenseRow;
  expense: Expense;
  onClose: () => void;
  onEdit: (expense: Expense) => void;
  onDelete: (expenseId: string) => Promise<void>;
}

/**
 * Slide-over drawer showing the full details of a single transaction, with
 * Edit and Delete actions. Mirrors the transaction-history detail pane from the
 * FamilyVault design.
 */
function TransactionDetailsDrawer({
  row,
  expense,
  onClose,
  onEdit,
  onDelete,
}: TransactionDetailsDrawerProps): JSX.Element {
  const [isDeleting, setIsDeleting] = useState(false);

  // Lock background page scroll while the drawer is open so the page behind
  // doesn't scroll and there's no double-scroll. Restored on close/unmount.
  useEffect(() => {
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, []);

  const handleDelete = useCallback(async () => {
    setIsDeleting(true);
    try {
      await onDelete(expense.id);
    } finally {
      setIsDeleting(false);
    }
  }, [expense.id, onDelete]);

  return (
    <div
      className="fixed inset-0 z-[60] flex justify-end bg-black/70 backdrop-blur-sm"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Transaction details"
        data-testid="expense-details-drawer"
        className="w-full max-w-md h-full flex flex-col bg-surface-container-lowest border-l border-outline-variant/30"
      >
        {/* Scrollable content area. */}
        <div className="flex-1 overflow-y-auto custom-scrollbar p-5 md:p-6 flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <span className="shrink-0 w-11 h-11 rounded-lg bg-primary-container/10 flex items-center justify-center text-primary-container">
              <span className="material-symbols-outlined" aria-hidden="true">
                {categoryIcon(row.categoryName)}
              </span>
            </span>
            <div>
              <p className="text-label-caps uppercase text-on-surface-variant">Transaction</p>
              <h2 className="text-headline-md font-semibold text-on-surface mt-0.5">
                {row.categoryName}
                {row.subCategoryName !== undefined && (
                  <span className="text-on-surface-variant font-normal"> · {row.subCategoryName}</span>
                )}
              </h2>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close details"
            data-testid="expense-details-close"
            className="btn-ghost p-1.5 text-on-surface-variant hover:text-on-surface"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">close</span>
          </button>
        </div>

        <div className="glass-card p-card_padding flex flex-col items-center gap-2 text-center">
          <span className="text-label-caps uppercase text-on-surface-variant">Amount</span>
          <Money amount={row.amount} className="text-[clamp(32px,6vw,44px)] leading-none font-extrabold tracking-tighter text-white neon-glow" />
          <span className="text-sm text-on-surface-variant mt-1">{formatDate(row.date)}</span>
        </div>

        <dl className="flex flex-col gap-3 text-sm">
          {row.subCategoryName !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-on-surface-variant">Sub-category</dt>
              <dd className="text-on-surface">{row.subCategoryName}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-on-surface-variant">Source</dt>
            <dd className="text-on-surface inline-flex items-center gap-1.5">
              <span className="material-symbols-outlined text-base text-primary-container" aria-hidden="true">
                {sourceIcon(row.sourceName)}
              </span>
              {row.sourceName}
            </dd>
          </div>
          {row.subSourceNickname !== undefined && (
            <div className="flex items-center justify-between gap-4">
              <dt className="text-on-surface-variant">Card/account</dt>
              <dd className="text-on-surface">{row.subSourceNickname}</dd>
            </div>
          )}
          <div className="flex items-center justify-between gap-4">
            <dt className="text-on-surface-variant">Recorded by</dt>
            <dd className="text-on-surface">{row.recordedByName}</dd>
          </div>
        </dl>

        {/* Notes / description section. */}
        <section className="flex flex-col gap-2">
          <h3 className="text-label-caps uppercase text-on-surface-variant">Notes</h3>
          {row.description.trim() !== '' ? (
            <p className="glass-card p-4 italic text-on-surface-variant">{row.description}</p>
          ) : (
            <p className="text-on-surface-variant/60 italic">No notes.</p>
          )}
        </section>
        </div>

        {/* Sticky action footer: always visible at the bottom of the drawer,
            so Edit/Delete are reachable without scrolling on small screens. */}
        <div className="shrink-0 flex gap-3 p-4 border-t border-outline-variant/20 bg-surface-container-lowest">
          <button
            type="button"
            onClick={() => onEdit(expense)}
            data-testid="expense-details-edit"
            className="btn-ghost flex-1 py-3 flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
            Edit
          </button>
          <button
            type="button"
            onClick={() => void handleDelete()}
            disabled={isDeleting}
            aria-busy={isDeleting}
            data-testid="expense-details-delete"
            className="btn-ghost flex-1 py-3 flex items-center justify-center gap-2 text-error border-error/30 hover:bg-error/10"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
            {isDeleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </aside>
    </div>
  );
}
