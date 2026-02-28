import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Pull Requests API', () => {
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

  it('POST /api/projects/:id/prs creates a PR with review cycle', async () => {
    const response = await inject({
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
    await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR1', description: '', sourceBranch: 'feat/1' },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/prs`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('GET /api/prs/:id returns a PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: 'desc', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${id}`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().title).toBe('PR');
  });

  it('POST /api/prs/:id/review approves a PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'approve' },
    });
    expect(response.statusCode).toBe(200);

    const pr = await inject({ method: 'GET', url: `/api/prs/${id}` });
    expect(pr.json().status).toBe('approved');
  });

  it('POST /api/prs/:id/review requests changes', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('changes_requested');
  });

  it('POST /api/prs/:id/agent-ready creates new review cycle', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    // Request changes first
    await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'request-changes' },
    });

    // Agent signals ready
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/agent-ready`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().cycleNumber).toBe(2);
    expect(response.json().status).toBe('pending_review');

    // Check cycles
    const cycles = await inject({
      method: 'GET',
      url: `/api/prs/${id}/cycles`,
    });
    expect(cycles.json()).toHaveLength(2);
  });

  it('POST /api/prs/:id/close closes an open PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/close`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('closed');

    const pr = await inject({ method: 'GET', url: `/api/prs/${id}` });
    expect(pr.json().status).toBe('closed');
  });

  it('POST /api/prs/:id/close returns 400 for already-closed PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    await inject({ method: 'POST', url: `/api/prs/${id}/close` });
    const response = await inject({ method: 'POST', url: `/api/prs/${id}/close` });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/prs/:id/close returns 400 for approved PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    await inject({
      method: 'POST',
      url: `/api/prs/${id}/review`,
      payload: { action: 'approve' },
    });

    const response = await inject({ method: 'POST', url: `/api/prs/${id}/close` });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/prs/:id/close returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/close',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/reopen reopens a closed PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    await inject({ method: 'POST', url: `/api/prs/${id}/close` });

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/reopen`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().status).toBe('open');

    const pr = await inject({ method: 'GET', url: `/api/prs/${id}` });
    expect(pr.json().status).toBe('open');
  });

  it('POST /api/prs/:id/reopen returns 400 for non-closed PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = create.json();

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id}/reopen`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/projects/:id/prs stores workingDirectory when provided', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Worktree PR',
        description: 'From a worktree',
        sourceBranch: 'feat/worktree',
        workingDirectory: '/repo/.claude/worktrees/task-1',
      },
    });
    expect(response.statusCode).toBe(201);
    const body = response.json();
    expect(body.workingDirectory).toBe('/repo/.claude/worktrees/task-1');
  });

  it('POST /api/projects/:id/prs defaults workingDirectory to null', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Normal PR',
        description: '',
        sourceBranch: 'feat/normal',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().workingDirectory).toBeNull();
  });
});
