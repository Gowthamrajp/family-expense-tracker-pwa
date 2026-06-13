import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import {
  usePwaStatus,
  markPwaRegistered,
  markPwaRegistrationFailed,
  resetPwaStatus,
} from './usePwaStatus';

describe('usePwaStatus', () => {
  beforeEach(() => {
    resetPwaStatus();
  });

  afterEach(() => {
    resetPwaStatus();
  });

  it('starts in the pending state with offline capabilities available', () => {
    const { result } = renderHook(() => usePwaStatus());
    expect(result.current.registration).toBe('pending');
    expect(result.current.offlineCapabilitiesUnavailable).toBe(false);
  });

  it('reflects a successful registration (Req 5.2)', () => {
    const { result } = renderHook(() => usePwaStatus());
    act(() => markPwaRegistered());
    expect(result.current.registration).toBe('registered');
    expect(result.current.offlineCapabilitiesUnavailable).toBe(false);
  });

  it('surfaces offline-capabilities-unavailable on registration failure (Req 5.3)', () => {
    const { result } = renderHook(() => usePwaStatus());
    const error = new Error('SW registration boom');
    act(() => markPwaRegistrationFailed(error));
    expect(result.current.registration).toBe('failed');
    expect(result.current.offlineCapabilitiesUnavailable).toBe(true);
    expect(result.current.error).toBe(error);
  });
});
