import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, jsonBody } from './helpers.js';

describe('Server', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];

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
    expect(jsonBody(response)).toEqual({ status: 'ok' });
  });
});

describe('Session token auth', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];

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
    expect(jsonBody(response).error).toContain('session token');
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

  it('rejects WebSocket requests with wrong token', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/ws?token=wrong',
    });
    expect(response.statusCode).toBe(401);
  });

  it('allows non-API/non-WS routes without auth', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/some-static-route',
    });
    expect(response.statusCode).not.toBe(401);
  });
});
