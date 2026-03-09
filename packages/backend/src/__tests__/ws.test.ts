import { describe, it, expect, vi } from 'vitest';
import { broadcast, websocketPlugin } from '../ws.js';
import type { FastifyInstance } from 'fastify';

describe('ws broadcast', () => {
  it('does not throw when called with no clients', () => {
    expect(() => {
      broadcast('test:event', { foo: 'bar' });
    }).not.toThrow();
  });
});

describe('websocketPlugin', () => {
  it('registers a /ws GET route with websocket enabled', () => {
    const routes: {
      url: string;
      method: string;
      websocket: boolean;
      handler: (...arguments_: unknown[]) => void;
    }[] = [];
    const fakeFastify = {
      get: vi.fn(
        (
          url: string,
          options: { websocket: boolean },
          handler: (...arguments_: unknown[]) => void,
        ) => {
          routes.push({
            url,
            method: 'GET',
            websocket: options.websocket,
            handler,
          });
        },
      ),
    } as unknown as FastifyInstance;

    websocketPlugin(fakeFastify);

    expect(routes).toHaveLength(1);
    expect(routes[0].url).toBe('/ws');
    expect(routes[0].websocket).toBe(true);
  });

  it('adds socket to clients on connection and removes on close', () => {
    let capturedHandler: ((...arguments_: unknown[]) => void) | undefined;
    const fakeFastify = {
      get: vi.fn(
        (
          _url: string,
          _options: unknown,
          handler: (...arguments_: unknown[]) => void,
        ) => {
          capturedHandler = handler;
        },
      ),
    } as unknown as FastifyInstance;

    websocketPlugin(fakeFastify);

    const closeHandlers: (() => void)[] = [];
    const mockSocket = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn((event: string, callback: () => void) => {
        if (event === 'close') closeHandlers.push(callback);
      }),
    };

    if (capturedHandler) {
      capturedHandler(mockSocket);
    }

    broadcast('test:event', { hello: 'world' });
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ event: 'test:event', data: { hello: 'world' } }),
    );

    closeHandlers[0]();

    mockSocket.send.mockClear();
    broadcast('test:event', { after: 'close' });
    expect(mockSocket.send).not.toHaveBeenCalled();
  });

  it('skips clients that are not in OPEN readyState', () => {
    let capturedHandler: ((...arguments_: unknown[]) => void) | undefined;
    const fakeFastify = {
      get: vi.fn(
        (
          _url: string,
          _options: unknown,
          handler: (...arguments_: unknown[]) => void,
        ) => {
          capturedHandler = handler;
        },
      ),
    } as unknown as FastifyInstance;

    websocketPlugin(fakeFastify);

    const openSocket = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn(),
    };
    const closedSocket = {
      readyState: 3,
      send: vi.fn(),
      on: vi.fn(),
    };

    if (capturedHandler) {
      capturedHandler(openSocket);
      capturedHandler(closedSocket);
    }

    broadcast('test:event', { data: 1 });

    expect(openSocket.send).toHaveBeenCalledTimes(1);
    expect(closedSocket.send).not.toHaveBeenCalled();

    const openClose = openSocket.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'close',
    );
    const closedClose = closedSocket.on.mock.calls.find(
      (call: unknown[]) => call[0] === 'close',
    );
    if (openClose) (openClose[1] as () => void)();
    if (closedClose) (closedClose[1] as () => void)();
  });
});
