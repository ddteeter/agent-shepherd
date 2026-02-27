import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Projects API', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:', disableOrchestrator: true });
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/projects creates a project', async () => {
    const response = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'my-app', path: '/tmp/my-app', baseBranch: 'main' },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.name).toBe('my-app');
    expect(body.path).toBe('/tmp/my-app');
    expect(body.id).toBeDefined();
  });

  it('GET /api/projects lists projects', async () => {
    await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj1', path: '/tmp/p1' },
    });
    await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj2', path: '/tmp/p2' },
    });

    const response = await server.inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(2);
  });

  it('GET /api/projects/:id returns a project', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().name).toBe('proj');
  });

  it('GET /api/projects/:id returns 404 for missing project', async () => {
    const response = await server.inject({
      method: 'GET',
      url: '/api/projects/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/projects/:id removes a project', async () => {
    const create = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = create.json();

    const del = await server.inject({
      method: 'DELETE',
      url: `/api/projects/${id}`,
    });
    expect(del.statusCode).toBe(204);

    const get = await server.inject({
      method: 'GET',
      url: `/api/projects/${id}`,
    });
    expect(get.statusCode).toBe(404);
  });
});
