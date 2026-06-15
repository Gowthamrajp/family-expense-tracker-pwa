/**
 * React hook that exposes the active family's sub-sources with live updates.
 *
 * A sub-source is an optional, family-scoped refinement of a {@link Source}
 * that stores only a nickname and an optional last-4 identifier — never a full
 * card number (Req 5.6, 9.5). While a family is resolved, the hook subscribes
 * to the Firestore real-time listener via
 * {@link subSourceRepository.subscribeToSubSources}, scoped to the family id.
 * It begins in a `loading` state, transitions to `ready` on the first
 * snapshot, and surfaces an `error` status on listener failure.
 *
 * `addSubSource` validates raw form input with {@link validateSubSource} before
 * any write: invalid input returns an `err` WITHOUT touching the data layer
 * (Req 5.2, 5.3, 5.5). `forSource` filters the loaded sub-sources to a single
 * {@link Source}, which the entry form uses to decide whether to show the
 * optional sub-source select (Req 3.7, 5.7).
 *
 * Coupling to the auth/family layers is intentionally loose: callers pass
 * `familyId` rather than this hook reaching into a context, so it can be used
 * and tested independently — mirroring {@link useExpenses}.
 *
 * NOTE (tasks 28.4/31): `familyId` is supplied by the caller. Until the
 * `FamilyProvider`/`useFamily` wiring lands (task 28.4) and routing is
 * finalized (task 31), the screen call sites pass `null`, which keeps the hook
 * idle (no subscription).
 */
import { useCallback, useEffect, useState } from 'react';

import { subSourceRepository } from '../data/subSourceRepository';
import { validateSubSource, type SubSourceError } from '../domain/subSource';
import {
  err,
  ok,
  type Result,
  type Source,
  type SubSource,
  type SubSourceFormInput,
} from '../domain/types';

/** Lifecycle status of the sub-source subscription. */
export type SubSourcesStatus = 'loading' | 'ready' | 'error';

/**
 * Result returned by {@link useSubSources}. Mirrors the design's
 * `UseSubSourcesResult` contract.
 */
export interface UseSubSourcesResult {
  /** Current sub-sources for the active family. */
  subSources: SubSource[];
  /** Subscription status: loading, ready, or error. */
  status: SubSourcesStatus;
  /**
   * Validate and persist a new sub-source. Returns `err` without writing when
   * the form input is invalid (Req 5.2, 5.3, 5.5); otherwise resolves with the
   * persisted {@link SubSource}.
   */
  addSubSource(
    input: SubSourceFormInput,
  ): Promise<Result<SubSource, SubSourceError>>;
  /** Sub-sources whose `source` matches the given {@link Source} (Req 3.7, 5.7). */
  forSource(source: Source): SubSource[];
}

/** Raised by `addSubSource` when invoked without a resolved family. */
export class NoActiveFamilyError extends Error {
  constructor() {
    super('Cannot add a sub-source without an active family.');
    this.name = 'NoActiveFamilyError';
  }
}

/**
 * Subscribe to the live, family-scoped sub-source list.
 *
 * @param familyId - The active family's id. When `null`, the hook does not
 *   subscribe and reports `loading` with no data. (Supplied by `useFamily` once
 *   task 28.4 wires it; call sites currently pass `null`.)
 * @returns The current sub-sources, subscription status, an `addSubSource`
 *   action, and a `forSource` selector.
 *
 * Validates: Requirements 3.7, 5.1, 5.2, 5.7
 */
export function useSubSources(familyId: string | null): UseSubSourcesResult {
  const [subSources, setSubSources] = useState<SubSource[]>([]);
  const [status, setStatus] = useState<SubSourcesStatus>('loading');

  useEffect(() => {
    if (familyId === null) {
      // No resolved family: do not subscribe. Reset to the initial loading
      // state so stale data is not surfaced once the family changes.
      setStatus('loading');
      setSubSources([]);
      return;
    }

    // Each (re)subscription starts in the loading state.
    setStatus('loading');

    const unsubscribe = subSourceRepository.subscribeToSubSources(
      familyId,
      (incoming) => {
        setSubSources(incoming);
        setStatus('ready');
      },
      () => {
        // Retain previously displayed data on error; only the status changes.
        setStatus('error');
      },
    );

    // Clean up on unmount and before re-subscribing (familyId change).
    return unsubscribe;
  }, [familyId]);

  const addSubSource = useCallback(
    async (
      input: SubSourceFormInput,
    ): Promise<Result<SubSource, SubSourceError>> => {
      // Validate before any write: invalid input never reaches the data layer
      // (Req 5.2, 5.3, 5.5).
      const validation = validateSubSource(input);
      if (!validation.ok) {
        return err(validation.error);
      }

      if (familyId === null) {
        // Defensive: callers should not invoke this without an active family.
        throw new NoActiveFamilyError();
      }

      const validatedInput = validation.value;
      const id = await subSourceRepository.addSubSource(
        familyId,
        validatedInput,
      );
      return ok({ id, ...validatedInput });
    },
    [familyId],
  );

  const forSource = useCallback(
    (source: Source): SubSource[] =>
      subSources.filter((subSource) => subSource.source === source),
    [subSources],
  );

  return { subSources, status, addSubSource, forSource };
}
