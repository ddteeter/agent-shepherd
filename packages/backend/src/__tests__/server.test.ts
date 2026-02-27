import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../server.js';
import type { FastifyInstance } from 'fastify';

describe('Server', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:', disableOrchestrator: true });
  });

  afterEach(async () => {
    await server.close();
  });

  it('responds to health check', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});
