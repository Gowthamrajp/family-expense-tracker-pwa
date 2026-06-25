/**
 * Firestore adapter for a family's `recurringRules` subcollection plus the
 * client-side materialization of due recurring Expenses.
 *
 * Recurring rules are family-scoped, stored under
 * `families/{familyId}/recurringRules/{ruleId}`. Because the app has no server
 * scheduler, {@link materializeDueExpenses} is called when a member opens the
 * app: for each active rule it computes the occurrences now due (via the pure
 * {@link dueOccurrences}), writes one Expense per due date through the
 * {@link expenseRepository}, and advances the rule's `lastRunDate` so the work
 * is idempotent and catches up on missed periods.
 *
 * One of the few modules that imports the Firestore SDK directly.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { dueOccurrences } from '../domain/recurring';
import type {
  ExpenseInput,
  FamilyMember,
  RecurringFrequency,
  RecurringRule,
  RecurringRuleDocument,
  RecurringRuleInput,
  Source,
} from '../domain/types';
import { expenseRepository } from './expenseRepository';
import { firestore } from './firebase';

/** Name of the top-level families collection. */
const FAMILIES_COLLECTION = 'families';
/** Name of the per-family recurring-rules subcollection. */
const RECURRING_COLLECTION = 'recurringRules';

/** Build a reference to the `families/{familyId}/recurringRules` subcollection. */
function recurringCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, RECURRING_COLLECTION);
}

/** Convert an SDK Timestamp (or null) to a Date, defaulting to the epoch. */
function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(0);
}

/** Map a recurring-rule document snapshot to the domain {@link RecurringRule}. */
function readRule(snapshot: QueryDocumentSnapshot<DocumentData>): RecurringRule {
  const data = snapshot.data() as RecurringRuleDocument;
  const rule: RecurringRule = {
    id: snapshot.id,
    amount: data.amount,
    categoryId: data.categoryId,
    source: data.source as Source,
    description: data.description ?? '',
    frequency: data.frequency as RecurringFrequency,
    startDate: tsToDate(data.startDate),
    lastRunDate:
      data.lastRunDate == null ? null : tsToDate(data.lastRunDate),
    active: data.active !== false,
    createdBy: data.createdBy,
    createdAt: tsToDate(data.createdAt),
  };
  if (data.subSourceId != null) {
    rule.subSourceId = data.subSourceId;
  }
  if (data.subCategoryId != null) {
    rule.subCategoryId = data.subCategoryId;
  }
  return rule;
}

/**
 * Outcome of {@link RecurringRepository.materializeDueExpenses}: how many
 * Expenses were generated across all rules in this pass.
 */
export interface MaterializeResult {
  /** Total number of Expenses created from due recurring occurrences. */
  created: number;
}

/**
 * Data-layer contract for recurring rules and their materialization.
 */
export interface RecurringRepository {
  /** Subscribe to the family's recurring rules (newest first). */
  subscribeToRules(
    familyId: string,
    onData: (rules: RecurringRule[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Persist a new recurring rule. Resolves with the new document id. */
  addRule(
    familyId: string,
    input: RecurringRuleInput,
    member: FamilyMember,
  ): Promise<string>;

  /**
   * Persist a new recurring rule AND immediately backfill expenses for every
   * occurrence from its start date through today (each tagged with the rule
   * id), advancing `lastRunDate` so the regular catch-up pass won't duplicate
   * them. Resolves with the new rule id and how many expenses were created.
   */
  addRuleWithBackfill(
    familyId: string,
    input: RecurringRuleInput,
    member: FamilyMember,
    today?: Date,
  ): Promise<{ id: string; created: number }>;

  /** Delete a recurring rule. Does not delete already-generated Expenses. */
  deleteRule(familyId: string, ruleId: string): Promise<void>;

  /**
   * Delete a recurring rule and also remove every expense it generated
   * (matched on `recurringRuleId`). Resolves with how many expenses were
   * deleted alongside the rule.
   */
  deleteRuleAndExpenses(familyId: string, ruleId: string): Promise<number>;

  /** Pause or resume a recurring rule. */
  setRuleActive(
    familyId: string,
    ruleId: string,
    active: boolean,
  ): Promise<void>;

  /**
   * Materialize all currently-due recurring Expenses for the family. For each
   * active rule, generates one Expense per due occurrence and advances the
   * rule's `lastRunDate`. Idempotent: re-running with no newly-due occurrences
   * creates nothing. Best-effort per rule; a failing rule does not abort the
   * others.
   */
  materializeDueExpenses(
    familyId: string,
    member: FamilyMember,
    today?: Date,
  ): Promise<MaterializeResult>;
}

/** Read all recurring rules once (used by materialization). */
async function readAllRules(familyId: string): Promise<RecurringRule[]> {
  const snapshot = await getDocs(recurringCollection(familyId));
  return snapshot.docs.map(readRule);
}

/**
 * Live {@link RecurringRepository} backed by the initialized Firestore instance.
 */
export const recurringRepository: RecurringRepository = {
  subscribeToRules(
    familyId: string,
    onData: (rules: RecurringRule[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const rulesQuery = query(
      recurringCollection(familyId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      rulesQuery,
      (snapshot) => onData(snapshot.docs.map(readRule)),
      (error) => onError(error),
    );
  },

  async addRule(
    familyId: string,
    input: RecurringRuleInput,
    member: FamilyMember,
  ): Promise<string> {
    const docData: DocumentData = {
      amount: input.amount,
      categoryId: input.categoryId,
      source: input.source,
      description: input.description,
      frequency: input.frequency,
      startDate: Timestamp.fromDate(input.startDate),
      lastRunDate: null,
      active: true,
      createdBy: member.uid,
      createdAt: serverTimestamp(),
    };
    if (input.subSourceId !== undefined && input.subSourceId !== '') {
      docData.subSourceId = input.subSourceId;
    }
    if (input.subCategoryId !== undefined && input.subCategoryId !== '') {
      docData.subCategoryId = input.subCategoryId;
    }
    const ref = await addDoc(recurringCollection(familyId), docData);
    return ref.id;
  },

  async addRuleWithBackfill(
    familyId: string,
    input: RecurringRuleInput,
    member: FamilyMember,
    today: Date = new Date(),
  ): Promise<{ id: string; created: number }> {
    // Persist the rule first so generated expenses can reference its id.
    const id = await this.addRule(familyId, input, member);

    // Build a transient rule object to drive the pure scheduler over the full
    // range [startDate .. today]. lastRunDate is null so it backfills from the
    // start date.
    const rule: RecurringRule = {
      id,
      amount: input.amount,
      categoryId: input.categoryId,
      source: input.source,
      description: input.description,
      frequency: input.frequency,
      startDate: input.startDate,
      lastRunDate: null,
      active: true,
      createdBy: member.uid,
      createdAt: today,
    };
    if (input.subSourceId !== undefined) {
      rule.subSourceId = input.subSourceId;
    }
    if (input.subCategoryId !== undefined) {
      rule.subCategoryId = input.subCategoryId;
    }

    const due = dueOccurrences(rule, today);
    let created = 0;
    for (const occurrence of due) {
      const expenseInput: ExpenseInput = {
        amount: rule.amount,
        category: 'Other',
        categoryId: rule.categoryId,
        source: rule.source,
        date: occurrence,
        description: rule.description,
        recurringRuleId: id,
      };
      if (rule.subSourceId !== undefined) {
        expenseInput.subSourceId = rule.subSourceId;
      }
      if (rule.subCategoryId !== undefined) {
        expenseInput.subCategoryId = rule.subCategoryId;
      }
      await expenseRepository.addExpense(familyId, expenseInput, member);
      created += 1;
    }

    // Advance lastRunDate to the final backfilled occurrence so the regular
    // catch-up pass on app open does not regenerate these.
    if (due.length > 0) {
      await updateDoc(doc(recurringCollection(familyId), id), {
        lastRunDate: Timestamp.fromDate(due[due.length - 1]),
      });
    }

    return { id, created };
  },

  async deleteRule(familyId: string, ruleId: string): Promise<void> {
    await deleteDoc(doc(recurringCollection(familyId), ruleId));
  },

  async deleteRuleAndExpenses(
    familyId: string,
    ruleId: string,
  ): Promise<number> {
    // Remove the generated expenses first, then the rule itself. If the
    // expense cleanup fails the rule remains, so the user can retry.
    const deleted = await expenseRepository.deleteExpensesByRecurringRule(
      familyId,
      ruleId,
    );
    await deleteDoc(doc(recurringCollection(familyId), ruleId));
    return deleted;
  },

  async setRuleActive(
    familyId: string,
    ruleId: string,
    active: boolean,
  ): Promise<void> {
    await updateDoc(doc(recurringCollection(familyId), ruleId), { active });
  },

  async materializeDueExpenses(
    familyId: string,
    member: FamilyMember,
    today: Date = new Date(),
  ): Promise<MaterializeResult> {
    const rules = await readAllRules(familyId);
    let created = 0;

    for (const rule of rules) {
      const due = dueOccurrences(rule, today);
      if (due.length === 0) {
        continue;
      }

      try {
        // Generate one Expense per due occurrence, preserving the occurrence
        // date as the Expense date so catch-up entries are dated correctly.
        for (const occurrence of due) {
          const input: ExpenseInput = {
            amount: rule.amount,
            // Legacy enum shim: the canonical reference is categoryId.
            category: 'Other',
            categoryId: rule.categoryId,
            source: rule.source,
            date: occurrence,
            description: rule.description,
          };
          if (rule.subSourceId !== undefined) {
            input.subSourceId = rule.subSourceId;
          }
          if (rule.subCategoryId !== undefined) {
            input.subCategoryId = rule.subCategoryId;
          }
          input.recurringRuleId = rule.id;
          await expenseRepository.addExpense(familyId, input, member);
          created += 1;
        }

        // Advance lastRunDate to the final generated occurrence so the next
        // pass resumes after it (idempotence + catch-up).
        const lastOccurrence = due[due.length - 1];
        await updateDoc(doc(recurringCollection(familyId), rule.id), {
          lastRunDate: Timestamp.fromDate(lastOccurrence),
        });
      } catch (error) {
        // Best-effort: log and continue with the other rules. Already-created
        // Expenses for this rule remain; lastRunDate was not advanced, so the
        // next pass may retry the remaining occurrences (the per-occurrence
        // writes are not deduped, so a partial failure can re-create — accepted
        // tradeoff for a client-only scheduler).
        console.warn(
          `Failed to fully materialize recurring rule ${rule.id} in family ${familyId}:`,
          error,
        );
      }
    }

    return { created };
  },
};
