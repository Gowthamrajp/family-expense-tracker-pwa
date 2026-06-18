/**
 * React hook exposing the active family's payment Sources with live updates and
 * add/rename/delete actions with validation feedback.
 *
 * Sources are family-managed funding methods. While a family is resolved, the
 * hook subscribes via {@link sourceRepository.subscribeToSources}. `addSource`
 * and `renameSource` validate the name against the existing Sources before any
 * write. Rename backfills every expense/sub-source/recurring rule that stored
 * the old name. Deletion is blocked when any of those still reference the
 * Source, returning an {@link InUseError} with the combined count.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

import { sourceRepository } from '../data/sourceRepository';
import { validateNewSource, type SourceNameError } from '../domain/source';
import {
  err,
  ok,
  type FamilySource,
  type InUseError,
  type Result,
} from '../domain/types';

/** Lifecycle status of the sources subscription. */
export type SourcesStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useSources}. */
export interface UseSourcesResult {
  sources: FamilySource[];
  status: SourcesStatus;
  /** Validate and add a new Source. */
  addSource(name: string): Promise<Result<FamilySource, SourceNameError>>;
  /** Validate and rename a Source (backfills referencing documents). */
  renameSource(
    sourceId: string,
    oldName: string,
    name: string,
  ): Promise<Result<FamilySource, SourceNameError>>;
  /** Delete a Source; blocked when referenced by any expense/sub-source/rule. */
  deleteSource(
    sourceId: string,
    name: string,
  ): Promise<Result<void, InUseError>>;
}

/**
 * Subscribe to the family's payment Sources and expose management actions.
 *
 * @param familyId - Active family id, or `null` to stay idle.
 */
export function useSources(familyId: string | null): UseSourcesResult {
  const [sources, setSources] = useState<FamilySource[]>([]);
  const [status, setStatus] = useState<SourcesStatus>('loading');

  const ref = useRef<FamilySource[]>(sources);
  ref.current = sources;

  useEffect(() => {
    if (familyId === null) {
      setStatus('loading');
      setSources([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = sourceRepository.subscribeToSources(
      familyId,
      (incoming) => {
        setSources(incoming);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsubscribe;
  }, [familyId]);

  const addSource = useCallback(
    async (name: string): Promise<Result<FamilySource, SourceNameError>> => {
      const validation = validateNewSource(name, ref.current);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null) {
        return err({ kind: 'required' });
      }
      const id = await sourceRepository.addSource(familyId, validation.value);
      return ok({ id, name: validation.value });
    },
    [familyId],
  );

  const renameSource = useCallback(
    async (
      sourceId: string,
      oldName: string,
      name: string,
    ): Promise<Result<FamilySource, SourceNameError>> => {
      const validation = validateNewSource(name, ref.current, sourceId);
      if (!validation.ok) {
        return err(validation.error);
      }
      if (familyId === null) {
        return err({ kind: 'required' });
      }
      await sourceRepository.renameSource(
        familyId,
        sourceId,
        oldName,
        validation.value,
      );
      return ok({ id: sourceId, name: validation.value });
    },
    [familyId],
  );

  const deleteSource = useCallback(
    async (
      sourceId: string,
      name: string,
    ): Promise<Result<void, InUseError>> => {
      if (familyId === null) {
        return ok(undefined);
      }
      return sourceRepository.deleteSource(familyId, sourceId, name);
    },
    [familyId],
  );

  return { sources, status, addSource, renameSource, deleteSource };
}
