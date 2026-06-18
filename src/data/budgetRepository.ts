/**
 * Firestore adapter for a family's monthly budget.
 *
 * The budget is a single document stored at
 * `families/{familyId}/settings/budget` (one rolling monthly budget per
 * family). This module is one of the few places that imports the Firestore SDK
 * directly, keeping SDK coupling out of the domain and state layers.
 */
import {
  deleteDoc,
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  Timestamp,
  type Unsubscribe,
} from 'firebase/firestore';

import type { Budget, BudgetDocument, BudgetMode } from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const SETTINGS_COLLECTION = 'settings';
const BUDGET_DOC_ID = 'budget';

/** Build a reference to the family's single budget settings document. */
function budgetDocRef(familyId: string) {
  return doc(
    firestore,
    FAMILIES_COLLECTION,
    familyId,
    SETTINGS_COLLECTION,
    BUDGET_DOC_ID,
  );
}

/** Map a Firestore budget document to the domain {@link Budget}. */
function readBudget(data: BudgetDocument): Budget {
  const updatedAt =
    data.updatedAt instanceof Timestamp
      ? data.updatedAt.toDate()
      : new Date();
  const budget: Budget = {
    mode: data.mode,
    updatedBy: data.updatedBy,
    updatedAt,
  };
  if (data.amount !== undefined) {
    budget.amount = data.amount;
  }
  if (data.percent !== undefined) {
    budget.percent = data.percent;
  }
  return budget;
}

/** Fields persisted when a member sets the budget. */
export interface SetBudgetInput {
  mode: BudgetMode;
  /** Provide for `amount` mode. */
  amount?: number;
  /** Provide for `percent` mode. */
  percent?: number;
  updatedBy: string;
}

/** Data-layer contract for persisting and observing a family's budget. */
export interface BudgetRepository {
  /**
   * Subscribe to the family's budget. `onData` is invoked with the budget on
   * every snapshot, or `null` when no budget has been set. Returns an
   * unsubscribe function.
   */
  subscribeToBudget(
    familyId: string,
    onData: (budget: Budget | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Create or replace the family's monthly budget. */
  setBudget(familyId: string, input: SetBudgetInput): Promise<void>;

  /** Remove the family's budget (clears the monthly cap). */
  clearBudget(familyId: string): Promise<void>;
}

/** Live {@link BudgetRepository} backed by the initialized Firestore instance. */
export const budgetRepository: BudgetRepository = {
  subscribeToBudget(
    familyId: string,
    onData: (budget: Budget | null) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    return onSnapshot(
      budgetDocRef(familyId),
      (snapshot) => {
        if (!snapshot.exists()) {
          onData(null);
          return;
        }
        onData(readBudget(snapshot.data() as BudgetDocument));
      },
      (error) => onError(error),
    );
  },

  async setBudget(familyId: string, input: SetBudgetInput): Promise<void> {
    // Write only the field relevant to the chosen mode so a stale amount/percent
    // never lingers when the family switches modes.
    const docData: Record<string, unknown> = {
      mode: input.mode,
      updatedBy: input.updatedBy,
      updatedAt: serverTimestamp(),
    };
    if (input.mode === 'amount') {
      docData.amount = input.amount;
    } else {
      docData.percent = input.percent;
    }
    await setDoc(budgetDocRef(familyId), docData);
  },

  async clearBudget(familyId: string): Promise<void> {
    await deleteDoc(budgetDocRef(familyId));
  },
};
