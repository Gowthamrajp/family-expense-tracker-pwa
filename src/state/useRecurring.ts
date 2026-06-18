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
  amount: string;
  categoryId: string;
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
  source?: boolean;
  frequency?: boolean;
  startDate?: boolean;
}

/** Result returned by {@link useRecurring}. */
export interface UseRecurringResult {
  rules: RecurringRule[];
  status: RecurringStatus;
  /** Validate and persist a new recurring rule. Returns errors without writing when invalid. */
  addRule(
    input: RecurringFormInput,
  ): Promise<Result<RecurringRule, RecurringFormErrors>>;
  /** Delete a recurring rule (does not remove already-generated expenses). */
  deleteRule(ruleId: string): Promise<void>;
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
    ): Promise<Result<RecurringRule, RecurringFormErrors>> => {
      const errors: RecurringFormErrors = {};

      const amountResult = validateAmount(input.amount);
      if (!amountResult.ok) {
        errors.amount = true;
      }
      if (input.categoryId === '') {
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
        amount: (amountResult as { ok: true; value: number }).value,
        categoryId: input.categoryId,
        source: input.source as Source,
        description: input.description,
        frequency: input.frequency as RecurringFrequency,
        startDate: (dateResult as { ok: true; value: Date }).value,
      };
      if (input.subSourceId !== '') {
        ruleInput.subSourceId = input.subSourceId;
      }

      const id = await recurringRepository.addRule(familyId, ruleInput, member);
      return ok({
        id,
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
    async (ruleId: string): Promise<void> => {
      if (familyId === null) {
        return;
      }
      await recurringRepository.deleteRule(familyId, ruleId);
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
