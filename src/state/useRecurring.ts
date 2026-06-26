/**
 * React hook exposing the active family's recurring-payment rules with live
 * updates, plus add/delete/pause actions and validation feedback.
 *
 * While a family is resolved, the hook subscribes to the Firestore listener via
 * {@link recurringRepository.subscribeToRules}. `addRule` validates the raw
 * form input (amount via {@link validateAmount}, a required category/source, a
 * valid start date via {@link validateDate}) before any write, mirroring the
 * expense-entry validation. Coupling to the family layer is loose: callers pass
 * `familyId` rather than reaching into a context, matching the other data hooks.
 */
import { useCallback, useEffect, useState } from 'react';

import { recurringRepository } from '../data/recurringRepository';
import { validateAmount, validateDate } from '../domain/validation';
import {
  err,
  ok,
  RECURRING_FREQUENCIES,
  type FamilyMember,
  type RecurringFrequency,
  type RecurringRule,
  type RecurringRuleInput,
  type Result,
  type Source,
} from '../domain/types';

/** Lifecycle status of the recurring-rules subscription. */
export type RecurringStatus = 'loading' | 'ready' | 'error';

/** Raw, unvalidated values captured from the add-recurring form. */
export interface RecurringFormInput {
  /** Whether the rule generates an expense (default) or income. */
  kind?: 'expense' | 'income';
  amount: string;
  categoryId: string;
  subCategoryId: string;
  source: string;
  subSourceId: string;
  description: string;
  frequency: string;
  /** `yyyy-mm-dd` start date, or empty to default to today. */
  startDate: string;
}

/** Why an add-recurring submission was rejected (per-field). */
export interface RecurringFormErrors {
  amount?: boolean;
  category?: boolean;
  subCategory?: boolean;
  source?: boolean;
  frequency?: boolean;
  startDate?: boolean;
}

/** Result returned by {@link useRecurring}. */
export interface UseRecurringResult {
  rules: RecurringRule[];
  status: RecurringStatus;
  /**
   * Validate and persist a new recurring rule. Returns errors without writing
   * when invalid. When `backfill` is true, also generates expenses for every
   * occurrence from the rule's start date through today.
   */
  addRule(
    input: RecurringFormInput,
    backfill?: boolean,
  ): Promise<Result<RecurringRule, RecurringFormErrors>>;
  /**
   * Delete a recurring rule. When `deletePrevious` is true, also removes every
   * expense the rule generated; otherwise those expenses are retained.
   */
  deleteRule(ruleId: string, deletePrevious?: boolean): Promise<void>;
  /** Pause or resume a recurring rule. */
  setRuleActive(ruleId: string, active: boolean): Promise<void>;
}

/** Type guard for a valid (non-empty) Source name. */
function isSource(value: string): value is Source {
  return value.trim() !== '';
}

/** Type guard for a valid frequency. */
function isFrequency(value: string): value is RecurringFrequency {
  return (RECURRING_FREQUENCIES as readonly string[]).includes(value);
}

/**
 * Subscribe to the family's recurring rules and expose management actions.
 *
 * @param familyId - Active family id, or `null` to stay idle.
 * @param member - The current member, attributed as the rule creator on add.
 */
export function useRecurring(
  familyId: string | null,
  member: FamilyMember | null,
): UseRecurringResult {
  const [rules, setRules] = useState<RecurringRule[]>([]);
  const [status, setStatus] = useState<RecurringStatus>('loading');

  useEffect(() => {
    if (familyId === null) {
      setStatus('loading');
      setRules([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = recurringRepository.subscribeToRules(
      familyId,
      (incoming) => {
        setRules(incoming);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsubscribe;
  }, [familyId]);

  const addRule = useCallback(
    async (
      input: RecurringFormInput,
      backfill = false,
    ): Promise<Result<RecurringRule, RecurringFormErrors>> => {
      const errors: RecurringFormErrors = {};
      const isIncome = input.kind === 'income';

      const amountResult = validateAmount(input.amount);
      if (!amountResult.ok) {
        errors.amount = true;
      }
      // Income rules have no category; expense rules require one.
      if (!isIncome && input.categoryId === '') {
        errors.category = true;
      }
      if (!isSource(input.source)) {
        errors.source = true;
      }
      if (!isFrequency(input.frequency)) {
        errors.frequency = true;
      }
      const dateResult = validateDate(input.startDate, new Date());
      if (!dateResult.ok) {
        errors.startDate = true;
      }

      if (Object.keys(errors).length > 0) {
        return err(errors);
      }
      if (familyId === null || member === null) {
        return err({ amount: false });
      }

      const ruleInput: RecurringRuleInput = {
        kind: isIncome ? 'income' : 'expense',
        amount: (amountResult as { ok: true; value: number }).value,
        categoryId: isIncome ? '' : input.categoryId,
        source: input.source as Source,
        description: input.description,
        frequency: input.frequency as RecurringFrequency,
        startDate: (dateResult as { ok: true; value: Date }).value,
      };
      // Sub-source/sub-category only apply to expense rules.
      if (!isIncome && input.subSourceId !== '') {
        ruleInput.subSourceId = input.subSourceId;
      }
      if (!isIncome && input.subCategoryId !== '') {
        ruleInput.subCategoryId = input.subCategoryId;
      }

      // When backfill is requested, generate records for every occurrence
      // from the start date through today; otherwise just create the rule.
      const id = backfill
        ? (await recurringRepository.addRuleWithBackfill(familyId, ruleInput, member)).id
        : await recurringRepository.addRule(familyId, ruleInput, member);
      return ok({
        id,
        kind: isIncome ? 'income' : 'expense',
        ...ruleInput,
        lastRunDate: null,
        active: true,
        createdBy: member.uid,
        createdAt: new Date(),
      });
    },
    [familyId, member],
  );

  const deleteRule = useCallback(
    async (ruleId: string, deletePrevious = false): Promise<void> => {
      if (familyId === null) {
        return;
      }
      if (deletePrevious) {
        await recurringRepository.deleteRuleAndExpenses(familyId, ruleId);
      } else {
        await recurringRepository.deleteRule(familyId, ruleId);
      }
    },
    [familyId],
  );

  const setRuleActive = useCallback(
    async (ruleId: string, active: boolean): Promise<void> => {
      if (familyId === null) {
        return;
      }
      await recurringRepository.setRuleActive(familyId, ruleId, active);
    },
    [familyId],
  );

  return { rules, status, addRule, deleteRule, setRuleActive };
}
