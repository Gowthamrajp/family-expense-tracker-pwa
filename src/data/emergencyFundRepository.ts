/**
 * Firestore adapter for a family's `emergencyFund` subcollection.
 *
 * The emergency fund is a family-scoped store of assets (cash, bank, FD, gold,
 * etc.) set aside for emergencies, stored under
 * `families/{familyId}/emergencyFund/{assetId}`. This mirrors the lean income
 * repository: each asset records its type, a free-text label, its current INR
 * value, and an optional note. One of the few modules that imports the
 * Firestore SDK directly.
 */
import {
  addDoc,
  collection,
  deleteDoc,
  deleteField,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';

import { resolveMemberLabel } from '../domain/member';
import type {
  EmergencyFundAsset,
  EmergencyFundAssetInput,
  EmergencyFundAssetType,
  FamilyMember,
  GoldPurity,
} from '../domain/types';
import { firestore } from './firebase';

const FAMILIES_COLLECTION = 'families';
const EMERGENCY_FUND_COLLECTION = 'emergencyFund';

/** Build a reference to the `families/{familyId}/emergencyFund` subcollection. */
function emergencyFundCollection(familyId: string) {
  return collection(firestore, FAMILIES_COLLECTION, familyId, EMERGENCY_FUND_COLLECTION);
}

/** Convert an SDK Timestamp (or null) to a Date, defaulting to the epoch. */
function tsToDate(value: unknown): Date {
  if (value instanceof Timestamp) {
    return value.toDate();
  }
  return new Date(0);
}

/** Map an asset document snapshot to the domain {@link EmergencyFundAsset}. */
function readAsset(snapshot: QueryDocumentSnapshot<DocumentData>): EmergencyFundAsset {
  const data = snapshot.data();
  const asset: EmergencyFundAsset = {
    id: snapshot.id,
    assetType: (data.assetType ?? 'other') as EmergencyFundAssetType,
    label: data.label ?? '',
    amount: typeof data.amount === 'number' ? data.amount : 0,
    note: data.note ?? '',
    recordedBy: data.recordedBy,
    createdAt: tsToDate(data.createdAt),
  };
  if (data.recordedByName !== undefined) {
    asset.recordedByName = data.recordedByName;
  }
  if (typeof data.goldGrams === 'number') {
    asset.goldGrams = data.goldGrams;
  }
  if (data.goldPurity !== undefined) {
    asset.goldPurity = data.goldPurity as GoldPurity;
  }
  if (data.updatedBy !== undefined) {
    asset.updatedBy = data.updatedBy;
  }
  if (data.updatedAt !== undefined) {
    asset.updatedAt = tsToDate(data.updatedAt);
  }
  return asset;
}

/** Data-layer contract for the family emergency fund. */
export interface EmergencyFundRepository {
  /** Subscribe to the family's emergency-fund assets (newest first). */
  subscribeToAssets(
    familyId: string,
    onData: (assets: EmergencyFundAsset[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe;

  /** Persist a new asset attributed to `member`. Resolves with its id. */
  addAsset(
    familyId: string,
    input: EmergencyFundAssetInput,
    member: FamilyMember,
  ): Promise<string>;

  /** Update an existing asset (preserves recorder/createdAt). */
  updateAsset(
    familyId: string,
    assetId: string,
    input: EmergencyFundAssetInput,
    member: FamilyMember,
  ): Promise<void>;

  /** Delete an asset. Any family member may delete any asset. */
  deleteAsset(familyId: string, assetId: string): Promise<void>;
}

/** Live {@link EmergencyFundRepository} backed by Firestore. */
export const emergencyFundRepository: EmergencyFundRepository = {
  subscribeToAssets(
    familyId: string,
    onData: (assets: EmergencyFundAsset[]) => void,
    onError: (error: Error) => void,
  ): Unsubscribe {
    const assetsQuery = query(
      emergencyFundCollection(familyId),
      orderBy('createdAt', 'desc'),
    );
    return onSnapshot(
      assetsQuery,
      (snapshot) => onData(snapshot.docs.map(readAsset)),
      (error) => onError(error),
    );
  },

  async addAsset(
    familyId: string,
    input: EmergencyFundAssetInput,
    member: FamilyMember,
  ): Promise<string> {
    const docData: DocumentData = {
      assetType: input.assetType,
      label: input.label,
      amount: input.amount,
      note: input.note,
      recordedBy: member.uid,
      recordedByName: resolveMemberLabel(member),
      createdAt: serverTimestamp(),
    };
    if (input.goldGrams !== undefined) {
      docData.goldGrams = input.goldGrams;
    }
    if (input.goldPurity !== undefined) {
      docData.goldPurity = input.goldPurity;
    }
    const ref = await addDoc(emergencyFundCollection(familyId), docData);
    return ref.id;
  },

  async updateAsset(
    familyId: string,
    assetId: string,
    input: EmergencyFundAssetInput,
    member: FamilyMember,
  ): Promise<void> {
    const docData: DocumentData = {
      assetType: input.assetType,
      label: input.label,
      amount: input.amount,
      note: input.note,
      updatedBy: member.uid,
      updatedAt: serverTimestamp(),
    };
    // Persist gold weight/purity when present; otherwise clear any stale gold
    // fields (e.g. when the asset type changed away from gold).
    docData.goldGrams = input.goldGrams !== undefined ? input.goldGrams : deleteField();
    docData.goldPurity = input.goldPurity !== undefined ? input.goldPurity : deleteField();
    await updateDoc(doc(emergencyFundCollection(familyId), assetId), docData);
  },

  async deleteAsset(familyId: string, assetId: string): Promise<void> {
    await deleteDoc(doc(emergencyFundCollection(familyId), assetId));
  },
};
