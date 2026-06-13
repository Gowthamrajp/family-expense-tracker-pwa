import { describe, it, expect } from 'vitest';
import {
  CATEGORIES,
  SOURCES,
  ok,
  err,
  type Result,
} from './types';

describe('domain type model', () => {
  it('exposes all categories', () => {
    expect(CATEGORIES).toContain('Groceries');
    expect(CATEGORIES).toHaveLength(8);
  });

  it('exposes all sources', () => {
    expect(SOURCES).toEqual([
      'Cash',
      'Credit Card',
      'Reward Points',
      'Food Coupon',
      'Cashback Points',
    ]);
  });

  it('ok() builds a success result', () => {
    const result: Result<number, string> = ok(42);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it('err() builds a failure result', () => {
    const result: Result<number, string> = err('boom');
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toBe('boom');
    }
  });
});
