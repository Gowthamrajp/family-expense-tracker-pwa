import { describe, it, expect } from 'vitest';
import {
  toFirestore,
  fromFirestore,
  resolveLabels,
  dateToTimestamp,
  timestampToDate,
} from './expenseMapper';
import type {
  Expense,
  ExpenseInput,
  FamilyCategory,
  FamilyMember,
  SubSource,
} from './types';

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

  it('toFirestore carries categoryId, subSourceId, and recordedByName', () => {
    const doc = toFirestore(
      { ...input, categoryId: 'cat-1', subSourceId: 'sub-1' },
      member,
    );
    expect(doc.categoryId).toBe('cat-1');
    expect(doc.subSourceId).toBe('sub-1');
    expect(doc.recordedByName).toBe('Jordan');
  });

  it('toFirestore omits optional references when absent', () => {
    const doc = toFirestore(input, member);
    expect(doc.categoryId).toBeUndefined();
    expect(doc.subSourceId).toBeUndefined();
  });

  it('toFirestore falls back through the member label resolution order', () => {
    const noName: FamilyMember = {
      uid: 'uid-x',
      displayName: null,
      email: 'x@example.com',
    };
    expect(toFirestore(input, noName).recordedByName).toBe('x@example.com');

    const anon: FamilyMember = { uid: 'uid-y', displayName: null, email: null };
    expect(toFirestore(input, anon).recordedByName).toBe('Signed in');
  });

  it('fromFirestore reads categoryId, subSourceId, and recordedByName', () => {
    const doc = toFirestore(
      { ...input, categoryId: 'cat-1', subSourceId: 'sub-1' },
      member,
    );
    const expense = fromFirestore('doc-3', doc);
    expect(expense.categoryId).toBe('cat-1');
    expect(expense.subSourceId).toBe('sub-1');
    expect(expense.recordedByName).toBe('Jordan');
  });
});

describe('resolveLabels', () => {
  const cats: FamilyCategory[] = [
    { id: 'cat-1', name: 'Groceries' },
    { id: 'cat-2', name: 'Dining Out' },
  ];
  const subs: SubSource[] = [
    { id: 'sub-1', source: 'Credit Card', nickname: 'Travel Card' },
  ];

  const baseExpense: Expense = {
    id: 'exp-1',
    amount: 12.34,
    category: 'Other',
    source: 'Credit Card',
    date: new Date('2024-05-01T00:00:00.000Z'),
    description: 'Lunch',
    recordedBy: 'uid-123',
    recordedByName: 'Jordan',
    createdAt: new Date('2024-05-01T00:00:00.000Z'),
  };

  it('resolves categoryId to the family category name', () => {
    const row = resolveLabels(
      { ...baseExpense, categoryId: 'cat-2' },
      cats,
      subs,
    );
    expect(row.categoryName).toBe('Dining Out');
  });

  it('falls back to the legacy category string when categoryId is absent', () => {
    const row = resolveLabels(baseExpense, cats, subs);
    expect(row.categoryName).toBe('Other');
  });

  it('falls back to the legacy category string when categoryId is unresolved', () => {
    const row = resolveLabels(
      { ...baseExpense, categoryId: 'missing' },
      cats,
      subs,
    );
    expect(row.categoryName).toBe('Other');
  });

  it('resolves subSourceId to the sub-source nickname when present', () => {
    const row = resolveLabels(
      { ...baseExpense, subSourceId: 'sub-1' },
      cats,
      subs,
    );
    expect(row.subSourceNickname).toBe('Travel Card');
  });

  it('omits subSourceNickname when subSourceId is absent or unresolved', () => {
    expect(resolveLabels(baseExpense, cats, subs).subSourceNickname).toBeUndefined();
    expect(
      resolveLabels({ ...baseExpense, subSourceId: 'missing' }, cats, subs)
        .subSourceNickname,
    ).toBeUndefined();
  });

  it('carries the row display fields including recordedByName', () => {
    const row = resolveLabels(baseExpense, cats, subs);
    expect(row).toMatchObject({
      id: 'exp-1',
      sourceName: 'Credit Card',
      amount: 12.34,
      description: 'Lunch',
      recordedByName: 'Jordan',
    });
    expect(row.date.getTime()).toBe(baseExpense.date.getTime());
  });

  it('falls back to the recording uid when recordedByName is absent', () => {
    const { recordedByName, ...rest } = baseExpense;
    void recordedByName;
    const row = resolveLabels(rest as Expense, cats, subs);
    expect(row.recordedByName).toBe('uid-123');
  });
});
