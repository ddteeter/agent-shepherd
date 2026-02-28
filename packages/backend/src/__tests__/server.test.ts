import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, TEST_TOKEN } from './helpers.js';

describe('Server', () => {
  let server: FastifyInstance;
  let inject: ReturnType<typeof createTestServer> extends Promise<infer T> ? T['inject'] : never;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
  });

  it('responds to health check', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'ok' });
  });
});

describe('Session token auth', () => {
  let server: FastifyInstance;
  let inject: ReturnType<typeof createTestServer> extends Promise<infer T> ? T['inject'] : never;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
  });

  it('rejects API requests without token', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error).toContain('session token');
  });

  it('rejects API requests with wrong token', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/projects',
      headers: { 'x-session-token': 'wrong-token' },
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows /api/health without token', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/health',
    });
    expect(response.statusCode).toBe(200);
  });

  it('allows API requests with valid token', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(200);
  });
});
