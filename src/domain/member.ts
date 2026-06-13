/**
 * Member-related pure helpers for the Family Expense Tracker.
 */

import type { FamilyMember } from './types';

/**
 * Resolve the identity label displayed for an authenticated {@link FamilyMember}.
 *
 * Resolution order (Requirement 1.5):
 * 1. the display name when present,
 * 2. otherwise the email when present,
 * 3. otherwise the literal `"Signed in"`.
 *
 * A value is considered absent when it is `null`, `undefined`, or a string that
 * is empty or contains only whitespace.
 *
 * @param member the authenticated family member
 * @returns the label to display for the member
 */
export function resolveMemberLabel(member: FamilyMember): string {
  const displayName = normalize(member.displayName);
  if (displayName !== null) {
    return displayName;
  }

  const email = normalize(member.email);
  if (email !== null) {
    return email;
  }

  return 'Signed in';
}

/**
 * Trim a nullable string and treat empty/whitespace-only values as absent.
 *
 * @param value the value to normalize
 * @returns the trimmed string, or `null` when absent
 */
function normalize(value: string | null | undefined): string | null {
  if (value == null) {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
