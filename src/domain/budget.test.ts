/**
 * Unit tests for the monthly budget pure logic.
 */
import { describe, expect, it } from 'vitest';

import {
  BUDGET_WARNING_FRACTION,
  computeBudgetStatus,
  effectiveMonthlyLimit,
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
