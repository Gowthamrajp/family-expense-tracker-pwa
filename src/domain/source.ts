/**
 * Family-scoped payment Source pure logic.
 *
 * Sources became editable, family-scoped data (not a fixed enum). This module
 * holds the framework- and I/O-free rules for validating a proposed Source name
 * against a family's existing Sources, reusing {@link normalizeCategoryName}
 * for the canonical comparison form so Sources and Categories normalize
 * identically (trim + collapse whitespace + casefold).
 */

import { normalizeCategoryName } from './category';
import type { FamilySource, Result } from './types';
import { err, ok } from './types';

/**
 * Reasons a proposed Source name can be rejected. Discriminated by `kind`.
 *
 * - `required`: the name is empty or whitespace-only.
 * - `duplicate`: the normalized name matches an existing Source.
 */
export type SourceNameError =
  | { kind: 'required' }
  | { kind: 'duplicate' };

/**
 * Validate a proposed Source name against a family's existing Sources.
 *
 * - Rejects `{ kind: 'required' }` when the normalized name is empty.
 * - Rejects `{ kind: 'duplicate' }` when the normalized name matches an
 *   existing Source (case/space-insensitive). When `excludeId` is provided,
 *   that Source is ignored so renaming to its own re-cased name is allowed.
 * - Otherwise succeeds with the trimmed display name.
 */
export function validateNewSource(
  raw: string,
  existing: FamilySource[],
  excludeId?: string,
): Result<string, SourceNameError> {
  const normalized = normalizeCategoryName(raw);
  if (normalized.length === 0) {
    return err({ kind: 'required' });
  }
  const isDuplicate = existing.some(
    (source) =>
      source.id !== excludeId &&
      normalizeCategoryName(source.name) === normalized,
  );
  if (isDuplicate) {
    return err({ kind: 'duplicate' });
  }
  return ok(raw.trim());
}
