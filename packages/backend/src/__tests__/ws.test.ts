import { describe, it, expect, vi } from 'vitest';
import { broadcast, websocketPlugin } from '../ws.js';
import type { FastifyInstance } from 'fastify';

describe('ws broadcast', () => {
  it('does not throw when called with no clients', () => {
    expect(() => { broadcast('test:event', { foo: 'bar' }); }).not.toThrow();
  });
});

describe('websocketPlugin', () => {
  it('registers a /ws GET route with websocket enabled', async () => {
    const routes: {
      url: string;
      method: string;
      websocket: boolean;
      handler: Function;
    }[] = [];
    const fakeFastify = {
      get: vi.fn((url: string, options: any, handler: Function) => {
        routes.push({ url, method: 'GET', websocket: options.websocket, handler });
      }),
    } as unknown as FastifyInstance;

    await websocketPlugin(fakeFastify);

    expect(routes).toHaveLength(1);
    expect(routes[0].url).toBe('/ws');
    expect(routes[0].websocket).toBe(true);
  });

  it('adds socket to clients on connection and removes on close', async () => {
    let capturedHandler: Function | undefined;
    const fakeFastify = {
      get: vi.fn((_url: string, _options: any, handler: Function) => {
        capturedHandler = handler;
      }),
    } as unknown as FastifyInstance;

    await websocketPlugin(fakeFastify);

    const closeHandlers: Function[] = [];
    const mockSocket = {
      readyState: 1,
      send: vi.fn(),
      on: vi.fn((event: string, callback: Function) => {
        if (event === 'close') closeHandlers.push(callback);
      }),
    };

    capturedHandler!(mockSocket);

    broadcast('test:event', { hello: 'world' });
    expect(mockSocket.send).toHaveBeenCalledWith(
      JSON.stringify({ event: 'test:event', data: { hello: 'world' } }),
    );

    closeHandlers[0]();

    mockSocket.send.mockClear();
    broadcast('test:event', { after: 'close' });
    expect(mockSocket.send).not.toHaveBeenCalled();
  });

  it('skips clients that are not in OPEN readyState', async () => {
    let capturedHandler: Function | undefined;
    const fakeFastify = {
      get: vi.fn((_url: string, _options: any, handler: Function) => {
        capturedHandler = handler;
      }),
    } as unknown as FastifyInstance;

    await websocketPlugin(fakeFastify);

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

    capturedHandler!(openSocket);
    capturedHandler!(closedSocket);

    broadcast('test:event', { data: 1 });

    expect(openSocket.send).toHaveBeenCalledTimes(1);
    expect(closedSocket.send).not.toHaveBeenCalled();

    // Clean up: trigger close for both to avoid leaking into other tests
    const openClose = openSocket.on.mock.calls.find(
      (c: any) => c[0] === 'close',
    );
    const closedClose = closedSocket.on.mock.calls.find(
      (c: any) => c[0] === 'close',
    );
    if (openClose) openClose[1]();
    if (closedClose) closedClose[1]();
  });
});
