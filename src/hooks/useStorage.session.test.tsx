import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useLocalStorageContext } from './useStorage';

describe('signed-out session id', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is saved once consent is given, so a reload keeps the same session', () => {
    const first = renderHook(() => useLocalStorageContext(true));
    const id = first.result.current.sessionId;
    expect(localStorage.getItem('sessionId')).toBe(JSON.stringify(id));
    first.unmount();

    const reloaded = renderHook(() => useLocalStorageContext(true));
    expect(reloaded.result.current.sessionId).toBe(id);
  });

  it('is not saved without consent', () => {
    renderHook(() => useLocalStorageContext(false));
    expect(localStorage.getItem('sessionId')).toBeNull();
  });
});
