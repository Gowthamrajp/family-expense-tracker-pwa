import { describe, expect, it } from 'vitest';

import { spendingSeries } from './insights';
import type { Expense } from './types';

/** Minimal expense factory for series tests. */
function expense(amount: number, date: Date, categoryId?: string): Expense {
  return {
    id: `${date.toISOString()}-${amount}-${categoryId ?? ''}`,
    amount,
    category: 'Other',
    categoryId,
    source: 'Cash',
    date,
    description: '',
    recordedBy: 'u1',
    createdAt: date,
  };
}

describe('spendingSeries', () => {
  const today = new Date(2026, 5, 15); // 2026-06

  it('builds a contiguous, oldest-first monthly series ending at today', () => {
    const series = spendingSeries(
      [
        expense(100, new Date(2026, 5, 2)), // Jun
        expense(50, new Date(2026, 3, 10)), // Apr
      ],
      today,
      'month',
      6,
    );
    expect(series.map((p) => p.key)).toEqual([
      '2026-01',
      '2026-02',
      '2026-03',
      '2026-04',
      '2026-05',
      '2026-06',
    ]);
    // Empty months are zero-filled; matching months carry their totals.
    expect(series.find((p) => p.key === '2026-04')?.total).toBe(50);
    expect(series.find((p) => p.key === '2026-06')?.total).toBe(100);
    expect(series.find((p) => p.key === '2026-02')?.total).toBe(0);
  });

  it('builds a yearly series at year granularity', () => {
    const series = spendingSeries(
      [
        expense(200, new Date(2025, 1, 1)),
        expense(300, new Date(2026, 1, 1)),
      ],
      today,
      'year',
      3,
    );
    expect(series.map((p) => p.key)).toEqual(['2024', '2025', '2026']);
    expect(series[1].total).toBe(200);
    expect(series[2].total).toBe(300);
    expect(series[0].total).toBe(0);
  });

  it('filters by a predicate (e.g. a single category)', () => {
    const series = spendingSeries(
      [
        expense(100, new Date(2026, 5, 2), 'cat-a'),
        expense(40, new Date(2026, 5, 3), 'cat-b'),
      ],
      today,
      'month',
      1,
      (e) => e.categoryId === 'cat-a',
    );
    expect(series).toHaveLength(1);
    expect(series[0]).toEqual({ key: '2026-06', total: 100 });
  });

  it('sums multiple expenses in the same period (cents-accurate)', () => {
    const series = spendingSeries(
      [
        expense(10.1, new Date(2026, 5, 2)),
        expense(20.2, new Date(2026, 5, 9)),
      ],
      today,
      'month',
      1,
    );
    expect(series[0].total).toBeCloseTo(30.3, 5);
  });
});
