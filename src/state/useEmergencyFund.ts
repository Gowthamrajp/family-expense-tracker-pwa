/**
 * React hook exposing the active family's emergency-fund assets with live
 * updates plus add/update/delete actions. Mirrors {@link useIncome}: while a
 * Session is active and a family is resolved, it subscribes to the Firestore
 * listener via {@link emergencyFundRepository.subscribeToAssets}, begins
 * `loading`, transitions to `ready` on the first snapshot, and reports `error`
 * on listener failure. A `retry` re-establishes the listener.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';

import { emergencyFundRepository } from '../data/emergencyFundRepository';
import type {
  EmergencyFundAsset,
  EmergencyFundAssetInput,
} from '../domain/types';
import { useAuth } from './AuthProvider';

/** Lifecycle status of the emergency-fund subscription. */
export type EmergencyFundStatus = 'loading' | 'ready' | 'error';

/** Result returned by {@link useEmergencyFund}. */
export interface UseEmergencyFundResult {
  assets: EmergencyFundAsset[];
  /** Sum of all asset values, cents-accurate. */
  total: number;
  status: EmergencyFundStatus;
  retry: () => void;
  addAsset: (input: EmergencyFundAssetInput) => Promise<string>;
  updateAsset: (assetId: string, input: EmergencyFundAssetInput) => Promise<void>;
  deleteAsset: (assetId: string) => Promise<void>;
}

/**
 * Subscribe to the live, family-scoped emergency-fund assets.
 *
 * @param familyId The active family's id, or `null` to stay idle.
 * @param active Whether a Session is active. Defaults to `true`.
 */
export function useEmergencyFund(
  familyId: string | null,
  active: boolean = true,
): UseEmergencyFundResult {
  const { member } = useAuth();

  const [assets, setAssets] = useState<EmergencyFundAsset[]>([]);
  const [status, setStatus] = useState<EmergencyFundStatus>('loading');
  const [subscriptionAttempt, setSubscriptionAttempt] = useState(0);

  const retry = useCallback(() => {
    setSubscriptionAttempt((attempt) => attempt + 1);
  }, []);

  useEffect(() => {
    if (!active || familyId === null) {
      setStatus('loading');
      setAssets([]);
      return;
    }
    setStatus('loading');
    const unsubscribe = emergencyFundRepository.subscribeToAssets(
      familyId,
      (incoming) => {
        setAssets(incoming);
        setStatus('ready');
      },
      () => setStatus('error'),
    );
    return unsubscribe;
  }, [familyId, active, subscriptionAttempt]);

  const total = useMemo(
    () => assets.reduce((sum, a) => sum + Math.round(a.amount * 100), 0) / 100,
    [assets],
  );

  const addAsset = useCallback(
    async (input: EmergencyFundAssetInput): Promise<string> => {
      if (familyId === null) {
        throw new Error('Cannot add an asset without an active family.');
      }
      if (member === null) {
        throw new Error('Cannot add an asset without an authenticated member.');
      }
      return emergencyFundRepository.addAsset(familyId, input, member);
    },
    [familyId, member],
  );

  const updateAsset = useCallback(
    async (assetId: string, input: EmergencyFundAssetInput): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot update an asset without an active family.');
      }
      if (member === null) {
        throw new Error('Cannot update an asset without an authenticated member.');
      }
      await emergencyFundRepository.updateAsset(familyId, assetId, input, member);
    },
    [familyId, member],
  );

  const deleteAsset = useCallback(
    async (assetId: string): Promise<void> => {
      if (familyId === null) {
        throw new Error('Cannot delete an asset without an active family.');
      }
      await emergencyFundRepository.deleteAsset(familyId, assetId);
    },
    [familyId],
  );

  return { assets, total, status, retry, addAsset, updateAsset, deleteAsset };
}
