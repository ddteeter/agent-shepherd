import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { createTestServer, jsonBody } from '../../__tests__/helpers.js';
import { schema } from '../../db/index.js';

describe('Pull Requests API - additional coverage', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const response = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = jsonBody(response).id as string;
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /api/prs/:id returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('PUT /api/prs/:id updates a PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Original', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'PUT',
      url: `/api/prs/${id as string}`,
      payload: { title: 'Updated Title', description: 'New description' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).title).toBe('Updated Title');
  });

  it('PUT /api/prs/:id returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/prs/nonexistent',
      payload: { title: 'Updated' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/review returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/review',
      payload: { action: 'approve' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/review returns 400 for invalid action', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/review`,
      payload: { action: 'invalid-action' },
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/prs/:id/agent-ready returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/agent-ready',
    });
    expect(response.statusCode).toBe(404);
  });

  it('GET /api/prs/:id/cycles returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/cycles',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/reopen returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/reopen',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/cancel-agent returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/cancel-agent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/projects/:id/prs returns 404 for nonexistent project', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/projects/nonexistent/prs',
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/close returns 409 when agent is working', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const database = server.db;
    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, id as string))
      .all();
    if (cycles.length > 0) {
      database
        .update(schema.reviewCycles)
        .set({ status: 'agent_working' })
        .where(eq(schema.reviewCycles.id, cycles[0].id))
        .run();
    }

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/close`,
    });
    expect(response.statusCode).toBe(409);
  });

  it('POST /api/prs/:id/close succeeds when cycle has changes_requested but PR is still open', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/review`,
      payload: { action: 'request-changes' },
    });

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/close`,
    });
    expect(response.statusCode).toBe(200);
  });
});
