import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { act, renderHook } from '@testing-library/react';

import { useConnectivity } from './useConnectivity';

/** Set navigator.onLine and dispatch the matching window event. */
function goOffline(): void {
  Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
  window.dispatchEvent(new Event('offline'));
}

function goOnline(): void {
  Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  window.dispatchEvent(new Event('online'));
}

describe('useConnectivity', () => {
  beforeEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  afterEach(() => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
  });

  it('reports online by default (Req 5.6)', () => {
    const { result } = renderHook(() => useConnectivity());
    expect(result.current.isOffline).toBe(false);
    expect(result.current.reconnectedAt).toBeNull();
  });

  it('sets isOffline when the device goes offline (Req 5.6)', () => {
    const { result } = renderHook(() => useConnectivity());
    act(() => goOffline());
    expect(result.current.isOffline).toBe(true);
  });

  it('clears isOffline and stamps reconnectedAt on reconnect (Req 5.7)', () => {
    const { result } = renderHook(() => useConnectivity());

    act(() => goOffline());
    expect(result.current.isOffline).toBe(true);

    act(() => goOnline());
    expect(result.current.isOffline).toBe(false);
    expect(result.current.reconnectedAt).toBeTypeOf('number');
  });

  it('invokes onReconnect only on a genuine offline→online transition (Req 5.7)', () => {
    const onReconnect = vi.fn();
    renderHook(() => useConnectivity({ onReconnect }));

    // An online event without a preceding offline is not a reconnect.
    act(() => goOnline());
    expect(onReconnect).not.toHaveBeenCalled();

    act(() => goOffline());
    act(() => goOnline());
    expect(onReconnect).toHaveBeenCalledTimes(1);
  });
});
