import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, jsonBody } from '../../__tests__/helpers.js';

describe('Projects API - additional coverage', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
  });

  afterEach(async () => {
    await server.close();
  });

  it('PUT /api/projects/:id updates a project', async () => {
    const create = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'proj', path: '/tmp/p' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'PUT',
      url: `/api/projects/${id as string}`,
      payload: { name: 'updated-proj', baseBranch: 'develop' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).name).toBe('updated-proj');
    expect(jsonBody(response).baseBranch).toBe('develop');
  });

  it('PUT /api/projects/:id returns 404 for missing project', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/projects/nonexistent',
      payload: { name: 'updated' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/projects/:id returns 404 for missing project', async () => {
    const response = await inject({
      method: 'DELETE',
      url: '/api/projects/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });
});
