import type { FastifyInstance, InjectOptions } from 'fastify';
import { buildServer, type ServerOptions } from '../server.js';

export const TEST_TOKEN = 'test-session-token-for-testing';

export async function createTestServer(overrides?: Partial<ServerOptions>) {
  const server = await buildServer({
    dbPath: ':memory:',
    disableOrchestrator: true,
    sessionToken: TEST_TOKEN,
    ...overrides,
  });

  const inject = (opts: InjectOptions) =>
    server.inject({
      ...opts,
      headers: {
        ...opts.headers,
        'x-session-token': TEST_TOKEN,
      },
    });

  return { server, inject, token: TEST_TOKEN };
}
