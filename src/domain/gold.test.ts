import { describe, expect, it } from 'vitest';

import {
  GRAMS_PER_TROY_OUNCE,
  inrPerGram24k,
  inrPerGramForPurity,
  valueGoldHolding,
  type GoldRate,
} from './gold';

describe('gold valuation', () => {
  it('converts USD/oz + USD->INR to INR per gram (24k)', () => {
    // $2000/oz at ₹80/$ => ₹160000 per oz / 31.1034768 g ≈ ₹5144.43/g
    const perGram = inrPerGram24k(2000, 80);
    expect(perGram).toBeCloseTo((2000 * 80) / GRAMS_PER_TROY_OUNCE, 4);
    expect(perGram).toBeGreaterThan(5000);
    expect(perGram).toBeLessThan(5300);
  });

  const rate: GoldRate = { inrPerGram24k: 6000, asOf: new Date('2026-01-01') };

  it('values 24k gold at full fineness', () => {
    expect(valueGoldHolding(10, '24k', rate)).toBe(60000);
  });

  it('values 22k gold at 22/24 fineness', () => {
    // 10g * (22/24) * 6000 = 55000
    expect(valueGoldHolding(10, '22k', rate)).toBe(55000);
  });

  it('values 18k gold at 18/24 fineness', () => {
    // 10g * 0.75 * 6000 = 45000
    expect(valueGoldHolding(10, '18k', rate)).toBe(45000);
  });

  it('returns 0 for non-positive weights', () => {
    expect(valueGoldHolding(0, '24k', rate)).toBe(0);
    expect(valueGoldHolding(-5, '22k', rate)).toBe(0);
  });

  it('reports per-gram price for a purity', () => {
    expect(inrPerGramForPurity(rate, '24k')).toBe(6000);
    expect(inrPerGramForPurity(rate, '22k')).toBe(5500);
  });
});
