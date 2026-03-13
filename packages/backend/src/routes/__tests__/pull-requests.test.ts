import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';

describe('Pull Requests API', () => {
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
    const body = jsonBody(response);
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
    expect(jsonArrayBody(response)).toHaveLength(1);
  });

  it('GET /api/prs/:id returns a PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: 'desc', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${id as string}`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).title).toBe('PR');
  });

  it('POST /api/prs/:id/review approves a PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/review`,
      payload: { action: 'approve' },
    });
    expect(response.statusCode).toBe(200);

    const pr = await inject({ method: 'GET', url: `/api/prs/${id as string}` });
    expect(jsonBody(pr).status).toBe('approved');
  });

  it('POST /api/prs/:id/review requests changes', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/review`,
      payload: { action: 'request-changes' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).status).toBe('changes_requested');
  });

  it('POST /api/prs/:id/agent-ready creates new review cycle', async () => {
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
      url: `/api/prs/${id as string}/agent-ready`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).cycleNumber).toBe(2);
    expect(jsonBody(response).status).toBe('pending_review');

    const cycles = await inject({
      method: 'GET',
      url: `/api/prs/${id as string}/cycles`,
    });
    expect(jsonArrayBody(cycles)).toHaveLength(2);
  });

  it('POST /api/prs/:id/close closes an open PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/close`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).status).toBe('closed');

    const pr = await inject({ method: 'GET', url: `/api/prs/${id as string}` });
    expect(jsonBody(pr).status).toBe('closed');
  });

  it('POST /api/prs/:id/close returns 400 for already-closed PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    await inject({ method: 'POST', url: `/api/prs/${id as string}/close` });
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/close`,
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/prs/:id/close returns 400 for approved PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/review`,
      payload: { action: 'approve' },
    });

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/close`,
    });
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
    const { id } = jsonBody(create);

    await inject({ method: 'POST', url: `/api/prs/${id as string}/close` });

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/reopen`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).status).toBe('open');

    const pr = await inject({ method: 'GET', url: `/api/prs/${id as string}` });
    expect(jsonBody(pr).status).toBe('open');
  });

  it('POST /api/prs/:id/reopen returns 400 for non-closed PR', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/reopen`,
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
    const body = jsonBody(response);
    expect(body.workingDirectory).toBe('/repo/.claude/worktrees/task-1');
  });

  it('POST /api/prs/:id/resubmit supersedes current cycle and creates new one', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/resubmit`,
      payload: { context: 'Fixed the auth flow manually in Claude Code' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).cycleNumber).toBe(2);
    expect(jsonBody(response).status).toBe('pending_review');
    expect(jsonBody(response).context).toBe(
      'Fixed the auth flow manually in Claude Code',
    );

    const cycles = await inject({
      method: 'GET',
      url: `/api/prs/${id as string}/cycles`,
    });
    const cyclesData = jsonArrayBody(cycles);
    expect(cyclesData).toHaveLength(2);
    expect(cyclesData[0].status).toBe('superseded');
    expect(cyclesData[1].status).toBe('pending_review');
  });

  it('POST /api/prs/:id/resubmit works regardless of current cycle status', async () => {
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
      url: `/api/prs/${id as string}/resubmit`,
      payload: { context: 'Took over from agent' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).cycleNumber).toBe(2);
  });

  it('POST /api/prs/:id/resubmit requires context', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const { id } = jsonBody(create);

    const response = await inject({
      method: 'POST',
      url: `/api/prs/${id as string}/resubmit`,
      payload: {},
    });
    expect(response.statusCode).toBe(400);
  });

  it('POST /api/prs/:id/resubmit returns 404 for nonexistent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/resubmit',
      payload: { context: 'test' },
    });
    expect(response.statusCode).toBe(404);
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
    expect(jsonBody(response).workingDirectory).toBeNull();
  });
});
