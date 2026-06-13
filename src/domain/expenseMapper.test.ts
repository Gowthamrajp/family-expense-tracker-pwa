import { describe, it, expect } from 'vitest';
import {
  toFirestore,
  fromFirestore,
  dateToTimestamp,
  timestampToDate,
} from './expenseMapper';
import type { ExpenseInput, FamilyMember } from './types';

const member: FamilyMember = {
  uid: 'uid-123',
  displayName: 'Jordan',
  email: 'jordan@example.com',
};

const input: ExpenseInput = {
  amount: 42.5,
  category: 'Groceries',
  source: 'Cash',
  date: new Date('2024-03-15T10:30:00.000Z'),
  description: 'Weekly shop',
};

describe('expenseMapper', () => {
  it('toFirestore sets recordedBy to the member uid', () => {
    const doc = toFirestore(input, member);
    expect(doc.recordedBy).toBe('uid-123');
  });

  it('toFirestore includes a creation timestamp', () => {
    const createdAt = new Date('2024-03-15T12:00:00.000Z');
    const doc = toFirestore(input, member, createdAt);
    expect(timestampToDate(doc.createdAt).getTime()).toBe(createdAt.getTime());
  });

  it('toFirestore defaults createdAt to now when not provided', () => {
    const before = Date.now();
    const doc = toFirestore(input, member);
    const after = Date.now();
    const created = timestampToDate(doc.createdAt).getTime();
    expect(created).toBeGreaterThanOrEqual(before);
    expect(created).toBeLessThanOrEqual(after);
  });

  it('round-trips the user-entered fields through to-and-from mapping', () => {
    const doc = toFirestore(input, member);
    const expense = fromFirestore('doc-1', doc);

    expect(expense.id).toBe('doc-1');
    expect(expense.amount).toBe(input.amount);
    expect(expense.category).toBe(input.category);
    expect(expense.source).toBe(input.source);
    expect(expense.date.getTime()).toBe(input.date.getTime());
    expect(expense.description).toBe(input.description);
    expect(expense.recordedBy).toBe(member.uid);
  });

  it('preserves an empty description', () => {
    const doc = toFirestore({ ...input, description: '' }, member);
    expect(fromFirestore('doc-2', doc).description).toBe('');
  });

  it('dateToTimestamp and timestampToDate are inverses', () => {
    const date = new Date('2001-06-07T08:09:10.123Z');
    expect(timestampToDate(dateToTimestamp(date)).getTime()).toBe(
      date.getTime(),
    );
  });
});
