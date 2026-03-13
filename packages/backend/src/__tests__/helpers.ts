import type { InjectOptions } from 'fastify';
import type { LightMyRequestResponse } from 'fastify';
import { buildServer, type ServerOptions } from '../server.js';

export const TEST_TOKEN = 'test-session-token-for-testing';

export function jsonBody(
  response: LightMyRequestResponse,
): Record<string, unknown> {
  return response.json();
}

export function jsonArrayBody(
  response: LightMyRequestResponse,
): Record<string, unknown>[] {
  return response.json();
}

export async function createTestServer(overrides?: Partial<ServerOptions>) {
  const server = await buildServer({
    dbPath: ':memory:',
    disableOrchestrator: true,
    sessionToken: TEST_TOKEN,
    ...overrides,
  });

  const inject = (options: InjectOptions) =>
    server.inject({
      ...options,
      headers: {
        ...options.headers,
        'x-session-token': TEST_TOKEN,
      },
    });

  return { server, inject, token: TEST_TOKEN };
}
