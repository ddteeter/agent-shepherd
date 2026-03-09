import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, jsonBody } from '../../__tests__/helpers.js';

describe('Config API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-config' },
    });
    projectId = jsonBody(projectResponse).id as string;
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /api/config returns merged global config', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/config',
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)).toBeDefined();
  });

  it('PUT /api/config sets a global config key', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { key: 'theme', value: 'dark' },
    });
    expect(response.statusCode).toBe(200);
    const config = jsonBody(response);
    expect(config.theme).toBe('dark');
  });

  it('PUT /api/config returns 400 when key is missing', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/config',
      payload: { value: 'dark' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('PUT /api/config returns 400 when value is null', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/config',
      // eslint wants undefined but the API expects null to test validation
      payload: { key: 'theme', value: undefined },
    });
    expect(response.statusCode).toBe(400);
  });

  it('GET /api/projects/:id/config returns project config', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/config`,
    });
    expect(response.statusCode).toBe(200);
  });

  it('GET /api/projects/:id/config returns 404 for missing project', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/projects/nonexistent/config',
    });
    expect(response.statusCode).toBe(404);
  });

  it('PUT /api/projects/:id/config sets a project config key', async () => {
    const response = await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'lint', value: 'true' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).lint).toBe('true');
  });

  it('PUT /api/projects/:id/config returns 404 for missing project', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/projects/nonexistent/config',
      payload: { key: 'lint', value: 'true' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('PUT /api/projects/:id/config returns 400 when key is missing', async () => {
    const response = await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { value: 'true' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('PUT /api/projects/:id/config returns 400 when value is null', async () => {
    const response = await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'lint', value: undefined },
    });
    expect(response.statusCode).toBe(400);
  });
});
