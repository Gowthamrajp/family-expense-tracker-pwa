/**
 * Emergency Fund manager (Family settings section).
 *
 * Lets a family track assets set aside for emergencies across classes (cash,
 * bank balance, fixed deposits, gold, mutual funds, stocks, other). Shows the
 * combined total plus a per-asset-class breakdown, an add/edit form, and the
 * list of holdings with inline edit/delete. Wired via {@link useEmergencyFund};
 * amounts honor privacy mode through {@link Money}.
 */
import { useMemo, useState } from 'react';

import {
  EMERGENCY_FUND_ASSET_TYPES,
  EMERGENCY_FUND_ASSET_TYPE_LABELS,
  type EmergencyFundAsset,
  type EmergencyFundAssetInput,
  type EmergencyFundAssetType,
} from '../domain/types';
import {
  MAX_AMOUNT,
  MAX_DESCRIPTION_LENGTH,
  MIN_AMOUNT,
  validateAmount,
  validateDescription,
} from '../domain/validation';
import { useEmergencyFund } from '../state/useEmergencyFund';
import { Money, formatINR } from './Money';
import { Loader } from './Loader';

const CONTROL_CLASS = 'ghost-input px-3 py-2.5 text-body-md w-full';
const FIELD_CLASS = 'flex flex-col gap-1.5 text-left text-sm text-on-surface-variant';

/** Material Symbols icon per asset class. */
const ASSET_ICONS: Record<EmergencyFundAssetType, string> = {
  cash: 'payments',
  bank: 'account_balance',
  fd: 'savings',
  gold: 'paid',
  mutualFund: 'trending_up',
  stocks: 'show_chart',
  other: 'account_balance_wallet',
};

interface FormState {
  assetType: EmergencyFundAssetType;
  label: string;
  amount: string;
  note: string;
}

function freshForm(): FormState {
  return { assetType: 'cash', label: '', amount: '', note: '' };
}

function formFromAsset(asset: EmergencyFundAsset): FormState {
  return {
    assetType: asset.assetType,
    label: asset.label,
    amount: asset.amount.toString(),
    note: asset.note,
  };
}

interface FieldErrors {
  label?: string;
  amount?: string;
  note?: string;
}

/** Props for {@link EmergencyFund}. */
export interface EmergencyFundProps {
  familyId: string | null;
}

/** Render the emergency-fund management section. */
export function EmergencyFund({ familyId }: EmergencyFundProps): JSX.Element {
  const { assets, total, status, retry, addAsset, updateAsset, deleteAsset } =
    useEmergencyFund(familyId);

  const [form, setForm] = useState<FormState>(() => freshForm());
  const [errors, setErrors] = useState<FieldErrors>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [confirmation, setConfirmation] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmingDeleteId, setConfirmingDeleteId] = useState<string | null>(null);

  // Per-asset-class subtotals for the breakdown chips.
  const byType = useMemo(() => {
    const map = new Map<EmergencyFundAssetType, number>();
    for (const asset of assets) {
      map.set(
        asset.assetType,
        Math.round(((map.get(asset.assetType) ?? 0) + asset.amount) * 100) / 100,
      );
    }
    return map;
  }, [assets]);

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
    const next: FieldErrors = {};
    if (form.label.trim() === '') {
      next.label = 'Enter a name for this asset.';
    }
    const amountResult = validateAmount(form.amount);
    if (!amountResult.ok) {
      next.amount = 'Enter a valid amount.';
    }
    const noteResult = validateDescription(form.note);
    if (!noteResult.ok) {
      next.note = `Use at most ${MAX_DESCRIPTION_LENGTH} characters.`;
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
      const input: EmergencyFundAssetInput = {
        assetType: form.assetType,
        label: form.label.trim(),
        amount: (amountResult as { ok: true; value: number }).value,
        note: (noteResult as { ok: true; value: string }).value,
      };
      if (editingId !== null) {
        await updateAsset(editingId, input);
        setConfirmation('Asset updated.');
      } else {
        await addAsset(input);
        setConfirmation('Asset added.');
      }
      resetForm();
    } catch {
      setErrors({ amount: 'Saving failed. Please try again.' });
    } finally {
      setIsSaving(false);
    }
  };

  const startEdit = (asset: EmergencyFundAsset) => {
    setForm(formFromAsset(asset));
    setEditingId(asset.id);
    setErrors({});
    setConfirmation(null);
  };

  const handleDelete = async (assetId: string) => {
    setDeletingId(assetId);
    try {
      await deleteAsset(assetId);
      if (editingId === assetId) {
        resetForm();
      }
    } finally {
      setDeletingId(null);
      setConfirmingDeleteId(null);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {/* Total + per-class breakdown. */}
      <div className="glass-card p-card_padding flex flex-col gap-3 bg-emerald-400/[0.03]">
        <span className="text-label-caps uppercase text-on-surface-variant">
          Emergency fund total
        </span>
        <Money
          amount={total}
          testId="emergency-fund-total"
          className="block text-[clamp(28px,6vw,44px)] leading-none font-extrabold tracking-tighter text-emerald-400 neon-glow"
        />
        {assets.length > 0 && (
          <div className="flex flex-wrap gap-2 mt-1">
            {EMERGENCY_FUND_ASSET_TYPES.filter((t) => byType.has(t)).map((t) => (
              <span
                key={t}
                className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-full bg-surface-container-high/60 text-on-surface-variant"
              >
                <span className="material-symbols-outlined text-sm text-emerald-400" aria-hidden="true">
                  {ASSET_ICONS[t]}
                </span>
                {EMERGENCY_FUND_ASSET_TYPE_LABELS[t]}: {formatINR(byType.get(t) ?? 0)}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Add / edit form. */}
      <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
        <h3 className="text-label-caps uppercase tracking-widest text-on-surface-variant">
          {editingId !== null ? 'Edit asset' : 'Add asset'}
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <label className={FIELD_CLASS}>
            Asset type
            <select
              value={form.assetType}
              onChange={(e) => setField('assetType', e.target.value as EmergencyFundAssetType)}
              disabled={isSaving}
              data-testid="emergency-fund-type"
              className={CONTROL_CLASS}
            >
              {EMERGENCY_FUND_ASSET_TYPES.map((t) => (
                <option key={t} value={t}>{EMERGENCY_FUND_ASSET_TYPE_LABELS[t]}</option>
              ))}
            </select>
          </label>
          <label className={FIELD_CLASS}>
            Name / label
            <input
              type="text"
              value={form.label}
              onChange={(e) => setField('label', e.target.value)}
              disabled={isSaving}
              placeholder="HDFC FD, Sovereign gold bond, …"
              aria-invalid={errors.label !== undefined}
              data-testid="emergency-fund-label"
              className={CONTROL_CLASS}
              autoComplete="off"
            />
            {errors.label && <span role="alert" className="text-error text-xs">{errors.label}</span>}
          </label>
          <label className={FIELD_CLASS}>
            Current value
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
              data-testid="emergency-fund-amount"
              className={CONTROL_CLASS}
            />
            {errors.amount && <span role="alert" className="text-error text-xs">{errors.amount}</span>}
          </label>
          <label className={FIELD_CLASS}>
            Note (optional)
            <input
              type="text"
              value={form.note}
              onChange={(e) => setField('note', e.target.value)}
              disabled={isSaving}
              maxLength={MAX_DESCRIPTION_LENGTH}
              placeholder="Maturity date, account…"
              data-testid="emergency-fund-note"
              className={CONTROL_CLASS}
              autoComplete="off"
            />
            {errors.note && <span role="alert" className="text-error text-xs">{errors.note}</span>}
          </label>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={isSaving}
            aria-busy={isSaving}
            data-testid="emergency-fund-save"
            className="btn-primary px-5 py-2.5 flex items-center gap-2"
          >
            <span className="material-symbols-outlined text-lg" aria-hidden="true">
              {editingId !== null ? 'save' : 'add'}
            </span>
            {isSaving ? 'Saving…' : editingId !== null ? 'Save changes' : 'Add asset'}
          </button>
          {editingId !== null && (
            <button
              type="button"
              onClick={resetForm}
              disabled={isSaving}
              className="btn-ghost px-4 py-2.5 text-sm text-on-surface-variant"
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

      {/* Asset list. */}
      {status === 'loading' ? (
        <Loader label="Loading emergency fund…" block />
      ) : status === 'error' ? (
        <div role="alert" className="glass-card border-error/30 p-4 flex flex-wrap items-center gap-4">
          <p className="text-error">The emergency fund could not be loaded.</p>
          <button type="button" onClick={retry} className="btn-ghost px-4 py-2 text-sm">Retry</button>
        </div>
      ) : assets.length === 0 ? (
        <p className="text-on-surface-variant text-sm">
          No emergency-fund assets yet. Add cash, deposits, gold and more above.
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {assets.map((asset) => {
            const isDeleting = deletingId === asset.id;
            const isConfirming = confirmingDeleteId === asset.id;
            return (
              <li
                key={asset.id}
                data-testid="emergency-fund-row"
                className="flex items-center gap-3 px-3 py-2.5 rounded-lg bg-surface-container-high/40 border border-outline-variant/20"
              >
                <span className="shrink-0 w-9 h-9 rounded-lg bg-emerald-400/10 flex items-center justify-center text-emerald-400">
                  <span className="material-symbols-outlined text-lg" aria-hidden="true">
                    {ASSET_ICONS[asset.assetType]}
                  </span>
                </span>
                <div className="flex-1 min-w-0">
                  <p className="font-medium text-on-surface truncate">{asset.label}</p>
                  <p className="text-xs text-on-surface-variant flex items-center gap-1.5 flex-wrap">
                    <span>{EMERGENCY_FUND_ASSET_TYPE_LABELS[asset.assetType]}</span>
                    {asset.note.trim() !== '' && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span className="truncate">{asset.note}</span>
                      </>
                    )}
                  </p>
                </div>
                <Money
                  amount={asset.amount}
                  className="font-mono-data text-base font-semibold text-emerald-400 shrink-0"
                />
                {isConfirming ? (
                  <span className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => void handleDelete(asset.id)}
                      disabled={isDeleting}
                      data-testid="emergency-fund-delete-confirm"
                      className="btn-ghost px-2 py-1 text-xs text-error"
                    >
                      {isDeleting ? 'Deleting…' : 'Confirm'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(null)}
                      disabled={isDeleting}
                      className="btn-ghost px-2 py-1 text-xs text-on-surface-variant"
                    >
                      Cancel
                    </button>
                  </span>
                ) : (
                  <span className="shrink-0 flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => startEdit(asset)}
                      aria-label={`Edit asset ${asset.label}`}
                      data-testid="emergency-fund-edit"
                      className="btn-ghost p-1.5 text-on-surface-variant hover:text-primary-container"
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">edit</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmingDeleteId(asset.id)}
                      aria-label={`Delete asset ${asset.label}`}
                      data-testid="emergency-fund-delete"
                      className="btn-ghost p-1.5 text-on-surface-variant hover:text-error"
                    >
                      <span className="material-symbols-outlined text-lg" aria-hidden="true">delete</span>
                    </button>
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
