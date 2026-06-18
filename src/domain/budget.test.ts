/**
 * Unit tests for the monthly budget pure logic.
 */
import { describe, expect, it } from 'vitest';

import {
  BUDGET_WARNING_FRACTION,
  categoryBudgetDocId,
  computeBudgetStatus,
  effectiveLimit,
  effectiveMonthlyLimit,
  scopedTotalForMonth,
  subCategoryBudgetDocId,
  validateBudgetValue,
} from './budget';
import type { Budget } from './types';

function amountBudget(amount: number): Budget {
  return { mode: 'amount', amount, updatedBy: 'u1', updatedAt: new Date() };
}

function percentBudget(percent: number): Budget {
  return { mode: 'percent', percent, updatedBy: 'u1', updatedAt: new Date() };
}

describe('validateBudgetValue', () => {
  it('rejects empty input', () => {
    expect(validateBudgetValue('amount', '   ')).toMatchObject({
      ok: false,
      error: { kind: 'required' },
    });
  });

  it('rejects non-numeric input', () => {
    expect(validateBudgetValue('amount', 'abc')).toMatchObject({
      ok: false,
      error: { kind: 'not-numeric' },
    });
  });

  it('rejects zero and negatives', () => {
    expect(validateBudgetValue('amount', '0')).toMatchObject({
      ok: false,
      error: { kind: 'too-small' },
    });
    expect(validateBudgetValue('percent', '-5')).toMatchObject({
      ok: false,
      error: { kind: 'too-small' },
    });
  });

  it('rejects values above the per-mode maximum', () => {
    expect(validateBudgetValue('amount', '1000000000')).toMatchObject({
      ok: false,
      error: { kind: 'too-large' },
    });
    expect(validateBudgetValue('percent', '1001')).toMatchObject({
      ok: false,
      error: { kind: 'too-large' },
    });
  });

  it('accepts valid values', () => {
    expect(validateBudgetValue('amount', '40000')).toEqual({
      ok: true,
      value: 40000,
    });
    expect(validateBudgetValue('percent', '90')).toEqual({
      ok: true,
      value: 90,
    });
  });
});

describe('effectiveMonthlyLimit', () => {
  it('returns the fixed amount in amount mode', () => {
    expect(effectiveMonthlyLimit(amountBudget(40000), 12345)).toBe(40000);
  });

  it('returns null for a malformed amount budget', () => {
    expect(effectiveMonthlyLimit(amountBudget(0), 100)).toBeNull();
  });

  it('computes a percentage of the previous-month total', () => {
    // 90% of 20000 = 18000.
    expect(effectiveMonthlyLimit(percentBudget(90), 20000)).toBe(18000);
  });

  it('returns 0 when there is no previous-month baseline', () => {
    expect(effectiveMonthlyLimit(percentBudget(90), 0)).toBe(0);
  });

  it('keeps paise precision in percent mode', () => {
    // 33% of 100.00 = 33.00.
    expect(effectiveMonthlyLimit(percentBudget(33), 100)).toBeCloseTo(33, 2);
  });
});

describe('computeBudgetStatus', () => {
  it('reports under when below the warning threshold', () => {
    const status = computeBudgetStatus(5000, 10000);
    expect(status.state).toBe('under');
    expect(status.remaining).toBe(5000);
    expect(status.fraction).toBeCloseTo(0.5, 5);
  });

  it('reports warning at the warning threshold', () => {
    const limit = 10000;
    const spent = limit * BUDGET_WARNING_FRACTION;
    expect(computeBudgetStatus(spent, limit).state).toBe('warning');
  });

  it('reports over when spend exceeds the limit', () => {
    const status = computeBudgetStatus(10001, 10000);
    expect(status.state).toBe('over');
    expect(status.remaining).toBeCloseTo(-1, 2);
  });

  it('treats no/zero limit as under with no fraction', () => {
    expect(computeBudgetStatus(500, null)).toMatchObject({
      state: 'under',
      fraction: null,
      remaining: null,
    });
    expect(computeBudgetStatus(500, 0)).toMatchObject({
      state: 'under',
      fraction: null,
    });
  });
});

describe('effectiveLimit', () => {
  it('returns the fixed amount in amount mode', () => {
    expect(effectiveLimit('amount', 5000, undefined, 9999)).toBe(5000);
  });

  it('returns null for a non-positive/absent amount', () => {
    expect(effectiveLimit('amount', 0, undefined, 100)).toBeNull();
    expect(effectiveLimit('amount', undefined, undefined, 100)).toBeNull();
  });

  it('computes a percentage of the previous-scope total', () => {
    expect(effectiveLimit('percent', undefined, 50, 4000)).toBe(2000);
  });

  it('returns null for a non-positive/absent percent', () => {
    expect(effectiveLimit('percent', undefined, 0, 100)).toBeNull();
    expect(effectiveLimit('percent', undefined, undefined, 100)).toBeNull();
  });
});

describe('scoped budget doc ids', () => {
  it('prefixes category and sub-category ids distinctly', () => {
    expect(categoryBudgetDocId('abc')).toBe('cat_abc');
    expect(subCategoryBudgetDocId('abc')).toBe('sub_abc');
  });
});

describe('scopedTotalForMonth', () => {
  const monthKeyOf = (d: Date): string =>
    `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
  const expenses = [
    { amount: 100, date: new Date(2026, 5, 3), categoryId: 'food', subCategoryId: 'dining' },
    { amount: 50, date: new Date(2026, 5, 10), categoryId: 'food', subCategoryId: 'groceries' },
    { amount: 25, date: new Date(2026, 5, 12), categoryId: 'travel' },
    { amount: 999, date: new Date(2026, 4, 1), categoryId: 'food', subCategoryId: 'dining' },
  ];

  it('sums a category scope within the month', () => {
    const total = scopedTotalForMonth(
      expenses,
      monthKeyOf,
      '2026-06',
      (e) => e.categoryId === 'food',
    );
    expect(total).toBeCloseTo(150, 2);
  });

  it('sums a sub-category scope within the month', () => {
    const total = scopedTotalForMonth(
      expenses,
      monthKeyOf,
      '2026-06',
      (e) => e.subCategoryId === 'dining',
    );
    expect(total).toBeCloseTo(100, 2);
  });

  it('excludes other months', () => {
    const total = scopedTotalForMonth(
      expenses,
      monthKeyOf,
      '2026-05',
      (e) => e.categoryId === 'food',
    );
    expect(total).toBeCloseTo(999, 2);
  });
});
