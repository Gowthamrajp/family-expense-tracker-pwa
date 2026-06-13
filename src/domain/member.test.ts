import { describe, it, expect } from 'vitest';
import { resolveMemberLabel } from './member';
import type { FamilyMember } from './types';

const base: FamilyMember = {
  uid: 'uid-1',
  displayName: null,
  email: null,
};

describe('resolveMemberLabel', () => {
  it('returns the display name when present', () => {
    const member: FamilyMember = {
      ...base,
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
    };
    expect(resolveMemberLabel(member)).toBe('Ada Lovelace');
  });

  it('falls back to email when display name is absent', () => {
    const member: FamilyMember = { ...base, email: 'ada@example.com' };
    expect(resolveMemberLabel(member)).toBe('ada@example.com');
  });

  it('falls back to "Signed in" when neither is present', () => {
    expect(resolveMemberLabel(base)).toBe('Signed in');
  });

  it('treats empty or whitespace-only display name as absent', () => {
    const member: FamilyMember = {
      ...base,
      displayName: '   ',
      email: 'ada@example.com',
    };
    expect(resolveMemberLabel(member)).toBe('ada@example.com');
  });

  it('treats empty or whitespace-only email as absent', () => {
    const member: FamilyMember = { ...base, displayName: null, email: '  ' };
    expect(resolveMemberLabel(member)).toBe('Signed in');
  });

  it('trims surrounding whitespace from the resolved label', () => {
    const member: FamilyMember = { ...base, displayName: '  Grace  ' };
    expect(resolveMemberLabel(member)).toBe('Grace');
  });
});
