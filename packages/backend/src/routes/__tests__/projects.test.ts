import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';
import { broadcast } from '../../ws.js';

vi.mock('../../ws.js', async (importOriginal) => {
  const original = await importOriginal<typeof import('../../ws.js')>();
  return {
    ...original,
    broadcast: vi.fn(original.broadcast),
  };
});

describe('Projects API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/projects creates a project', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'my-app', path: '/tmp/my-app', baseBranch: 'main' },
    });
    expect(response.statusCode).toBe(201);
    const body = jsonBody(response);
    expect(body.name).toBe('my-app');
    expect(body.path).toBe('/tmp/my-app');
    expect(body.id).toBeDefined();
  });

  it('GET /api/projects lists projects with pendingReviewCount', async () => {
    await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj1', path: '/tmp/p1' },
    });
    await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj2', path: '/tmp/p2' },
    });

    const response = await inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(200);
    const projects = jsonArrayBody(response);
    expect(projects).toHaveLength(2);
    expect(projects[0].pendingReviewCount).toBe(0);
    expect(projects[1].pendingReviewCount).toBe(0);
  });

  it('GET /api/projects includes pending review count from review cycles', async () => {
    const createResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj1', path: '/tmp/p1' },
    });
    const projectId = jsonBody(createResponse).id as string;

    await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Test PR',
        sourceBranch: 'feat/test',
        baseBranch: 'main',
      },
    });

    const response = await inject({
      method: 'GET',
      url: '/api/projects',
    });
    expect(response.statusCode).toBe(200);
    const projects = jsonArrayBody(response);
    expect(projects[0].pendingReviewCount).toBe(1);
  });

  it('GET /api/projects/:id returns a project', async () => {
    const create = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${id as string}`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).name).toBe('proj');
  });

  it('GET /api/projects/:id returns 404 for missing project', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/projects/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/projects broadcasts project:created', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'broadcast-test', path: '/tmp/bt' },
    });
    expect(response.statusCode).toBe(201);
    const body = jsonBody(response);
    expect(broadcast).toHaveBeenCalledWith(
      'project:created',
      expect.objectContaining({
        id: body.id,
        name: 'broadcast-test',
      }),
    );
  });

  it('DELETE /api/projects/:id removes a project', async () => {
    const create = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = jsonBody(create);

    const deleteResponse = await inject({
      method: 'DELETE',
      url: `/api/projects/${id as string}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const getResponse = await inject({
      method: 'GET',
      url: `/api/projects/${id as string}`,
    });
    expect(getResponse.statusCode).toBe(404);
  });
});
