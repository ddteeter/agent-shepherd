import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '../use-web-socket.js';

// Mock session token
vi.mock('../../session-token.js', () => ({
  getSessionToken: () => 'test-token',
}));

interface MockWebSocketInstance {
  url: string;
  listeners: Map<string, ((...arguments_: unknown[]) => void)[]>;
  addEventListener: (
    event: string,
    handler: (...arguments_: unknown[]) => void,
  ) => void;
  close: ReturnType<typeof vi.fn>;
  readyState: number;
}

function emitEvent(
  instance: MockWebSocketInstance,
  event: string,
  ...arguments_: unknown[]
) {
  const handlers = instance.listeners.get(event);
  if (handlers) {
    for (const handler of handlers) {
      handler(...arguments_);
    }
  }
}

describe('useWebSocket', () => {
  let mockWsInstances: MockWebSocketInstance[];
  let OriginalWebSocket: typeof WebSocket;

  beforeEach(() => {
    mockWsInstances = [];
    OriginalWebSocket = globalThis.WebSocket;

    const MockWS = function (this: MockWebSocketInstance, url: string) {
      this.url = url;
      this.listeners = new Map();
      this.addEventListener = (
        event: string,
        handler: (...arguments_: unknown[]) => void,
      ) => {
        const handlers = this.listeners.get(event) ?? [];
        handlers.push(handler);
        this.listeners.set(event, handlers);
      };
      this.close = vi.fn();
      this.readyState = 0;
      mockWsInstances.push(this);
    } as unknown as typeof WebSocket;
    (MockWS as unknown as Record<string, number>).CONNECTING = 0;
    (MockWS as unknown as Record<string, number>).OPEN = 1;
    (MockWS as unknown as Record<string, number>).CLOSING = 2;
    (MockWS as unknown as Record<string, number>).CLOSED = 3;

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
      emitEvent(mockWsInstances[0], 'open');
    });

    expect(result.current.connected).toBe(true);
  });

  it('sets connected to false on close', () => {
    const { result } = renderHook(() => useWebSocket());

    act(() => {
      emitEvent(mockWsInstances[0], 'open');
    });
    expect(result.current.connected).toBe(true);

    act(() => {
      emitEvent(mockWsInstances[0], 'close');
    });
    expect(result.current.connected).toBe(false);
  });

  it('calls onMessage callback with parsed data', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    act(() => {
      emitEvent(mockWsInstances[0], 'message', {
        data: JSON.stringify({ event: 'test', data: { foo: 1 } }),
      });
    });

    expect(onMessage).toHaveBeenCalledWith({ event: 'test', data: { foo: 1 } });
  });

  it('ignores malformed messages', () => {
    const onMessage = vi.fn();
    renderHook(() => useWebSocket(onMessage));

    act(() => {
      emitEvent(mockWsInstances[0], 'message', { data: 'not json' });
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
      emitEvent(mockWsInstances[0], 'close');
    });

    act(() => {
      vi.advanceTimersByTime(3000);
    });

    expect(mockWsInstances).toHaveLength(2);
    vi.useRealTimers();
  });

  it('uses wss: protocol for https: pages', () => {
    const originalLocation = globalThis.location;
    Object.defineProperty(globalThis, 'location', {
      value: { protocol: 'https:', host: 'example.com' },
      writable: true,
      configurable: true,
    });

    renderHook(() => useWebSocket());
    expect(mockWsInstances[0].url).toMatch(/^wss:/);

    Object.defineProperty(globalThis, 'location', {
      value: originalLocation,
      writable: true,
      configurable: true,
    });
  });
});
