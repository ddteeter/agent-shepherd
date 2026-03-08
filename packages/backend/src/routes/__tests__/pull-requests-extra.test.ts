import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Pull Requests API - additional coverage', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const res = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = res.json().id;
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
    const { id } = create.json();

    const response = await inject({
      method: 'PUT',
      url: `/api/prs/${id}`,
      payload: { title: 'Updated Title', description: 'New description' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('Updated Title');
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
    const { id } = create.json();

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
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
    const { id } = create.json();

    // Manually set cycle status to agent_working
    const db = (server as any).db;
    const { schema } = await import('../../db/index.js');
    const { eq } = await import('drizzle-orm');
    const cycles = db.select().from(schema.reviewCycles).where(eq(schema.reviewCycles.prId, id)).all();
    if (cycles.length > 0) {
      db.update(schema.reviewCycles)
        .set({ status: 'agent_working' })
        .where(eq(schema.reviewCycles.id, cycles[0].id))
        .run();
    }

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/close`,
    });
    expect(response.statusCode).toBe(409);
  });

  it('POST /api/prs/:id/close succeeds when cycle has changes_requested but PR is still open', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/close`,
    });
    expect(response.statusCode).toBe(200);
  });
});
