import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Pull Requests API', () => {
  let server: FastifyInstance;
  let projectId: string;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
    const res = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = res.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('POST /api/projects/:id/prs creates a PR with review cycle', async () => {
    const response = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Add feature',
        description: 'New feature',
        sourceBranch: 'feat/new',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.title).toBe('Add feature');
    expect(body.status).toBe('open');
  });

  it('GET /api/projects/:id/prs lists PRs', async () => {
    await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR1', description: '', sourceBranch: 'feat/1' },
    });

    const response = await server.inject({
      method: 'GET',
      url: `/api/projects/${projectId}/prs`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('GET /api/prs/:id returns a PR', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: 'desc', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('PR');
  });

  it('POST /api/prs/:id/review approves a PR', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'approve' },
    });
    expect(response.statusCode).toBe(200);

    const pr = await server.inject({ method: 'GET', url: `/api/prs/${id}` });
    expect(pr.json().status).toBe('approved');
  });

  it('POST /api/prs/:id/review requests changes', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('changes_requested');
  });

  it('POST /api/prs/:id/agent-ready creates new review cycle', async () => {
    const create = await server.inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    // Request changes first
    await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });

    // Agent signals ready
    const response = await server.inject({
      method: 'POST',
      url: `/api/prs/${id}/agent-ready`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().cycleNumber).toBe(2);
    expect(response.json().status).toBe('pending_review');

    // Check cycles
    const cycles = await server.inject({
      method: 'GET',
      url: `/api/prs/${id}/cycles`,
    });
    expect(cycles.json()).toHaveLength(2);
  });
});
