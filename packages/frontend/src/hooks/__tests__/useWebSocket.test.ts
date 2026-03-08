import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../useWebSocket.js';

// Mock session token
vi.mock('../../session-token.js', () => ({
  getSessionToken: () => 'test-token',
}));

describe('useWebSocket', () => {
  let mockWsInstances: any[];
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    mockWsInstances = [];
    OriginalWebSocket = globalThis.WebSocket;

    const MockWS = function (this: any, url: string) {
      this.url = url;
      this.onopen = null;
      this.onclose = null;
      this.onmessage = null;
      this.close = vi.fn();
      this.readyState = 0;
      mockWsInstances.push(this);
    } as any;
    MockWS.CONNECTING = 0;
    MockWS.OPEN = 1;
    MockWS.CLOSING = 2;
    MockWS.CLOSED = 3;

    globalThis.WebSocket = MockWS;
  });

  afterEach(() => {
    globalThis.WebSocket = OriginalWebSocket;
    vi.restoreAllMocks();
  });

  it('connects on mount', () => {
    renderHook(() => useWebSocket());
    expect(mockWsInstances).toHaveLength(1);
    expect(mockWsInstances[0].url).toContain('/ws?token=test-token');
  });

  it('sets connected to true on open', () => {
    const { result } = renderHook(() => useWebSocket());
    expect(result.current.connected).toBe(false);

    act(() => {
      mockWsInstances[0].onopen();
    });

    expect(result.current.connected).toBe(true);
  });

  it('sets connected to false on close', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      mockWsInstances[0].onopen();
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      mockWsInstances[0].onclose();
    });
    expect(result.current.connected).toBe(false);
  });

  it('calls onMessage callback with parsed data', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockWsInstances[0].onmessage({ data: JSON.stringify({ event: 'test', data: { foo: 1 } }) });
    });

    expect(onMessage).toHaveBeenCalledWith({ event: 'test', data: { foo: 1 } });
  });

  it('ignores malformed messages', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    act(() => {
      mockWsInstances[0].onmessage({ data: 'not json' });
    });

    expect(onMessage).not.toHaveBeenCalled();
  });

  it('closes WebSocket on unmount', () => {
    const { unmount } = renderHook(() => useWebSocket());
    unmount();
    expect(mockWsInstances[0].close).toHaveBeenCalled();
  });

  it('attempts reconnection on close', () => {
    vi.useFakeTimers();
    renderHook(() => useWebSocket());
    expect(mockWsInstances).toHaveLength(1);

    act(() => {
      mockWsInstances[0].onclose();
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockWsInstances).toHaveLength(2);
    vi.useRealTimers();
  });

  it('uses wss: protocol for https: pages', () => {
    const originalProtocol = window.location.protocol;
    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: 'https:', host: 'example.com' },
      writable: true,
    });

    renderHook(() => useWebSocket());
    expect(mockWsInstances[0].url).toMatch(/^wss:/);

    Object.defineProperty(window, 'location', {
      value: { ...window.location, protocol: originalProtocol },
      writable: true,
    });
  });
});
