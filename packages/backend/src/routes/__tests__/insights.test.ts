import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Insights API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = proj.json().id;

    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('GET /api/prs/:prId/insights returns null when no insights exist', async () => {
    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/insights`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toBeNull();
  });

  it('PUT /api/prs/:prId/insights creates insights on first call (upsert)', async () => {
    const categories = {
      claudeMdRecommendations: [{ title: 'Add lint rule', description: 'Enable no-unused-vars' }],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const response = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories, branchRef: 'feat/x', worktreePath: '/tmp/wt' },
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body.prId).toBe(prId);
    expect(body.categories).toEqual(categories);
    expect(body.branchRef).toBe('feat/x');
    expect(body.worktreePath).toBe('/tmp/wt');
    expect(body.id).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('PUT /api/prs/:prId/insights updates existing insights (upsert)', async () => {
    const categories1 = {
      claudeMdRecommendations: [{ title: 'Rule A', description: 'Desc A' }],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };
    const categories2 = {
      claudeMdRecommendations: [{ title: 'Rule B', description: 'Desc B' }],
      skillRecommendations: [{ title: 'Skill 1', description: 'Do this' }],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    // First PUT — create
    const first = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories1 },
    });
    expect(first.statusCode).toBe(200);
    const firstId = first.json().id;

    // Second PUT — update
    const second = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories2, branchRef: 'feat/y' },
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(firstId); // same row
    expect(second.json().categories).toEqual(categories2);
    expect(second.json().branchRef).toBe('feat/y');
  });

  it('GET /api/projects/:projectId/comments/history returns comments across all PRs', async () => {
    // Create a second PR in the same project
    const pr2 = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR 2', description: '', sourceBranch: 'feat/y' },
    });
    const prId2 = pr2.json().id;

    // Add a comment to PR 1
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'Fix in PR1', severity: 'must-fix', author: 'human' },
    });

    // Add a comment to PR 2
    await inject({
      method: 'POST',
      url: `/api/prs/${prId2}/comments`,
      payload: { filePath: 'src/b.ts', startLine: 5, endLine: 5, body: 'Fix in PR2', severity: 'suggestion', author: 'human' },
    });

    // Fetch comment history for the project
    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);

    const comments = response.json();
    expect(comments).toHaveLength(2);

    const bodies = comments.map((c: any) => c.body).sort();
    expect(bodies).toEqual(['Fix in PR1', 'Fix in PR2']);

    // Each comment should have a prId
    const prIds = comments.map((c: any) => c.prId).sort();
    expect(prIds).toEqual([prId, prId2].sort());
  });

  it('GET /api/projects/:projectId/comments/history returns empty array for project with no PRs', async () => {
    // Create a fresh project with no PRs
    const proj2 = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'empty-project', path: '/tmp/empty' },
    });
    const emptyProjectId = proj2.json().id;

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${emptyProjectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
  });

  it('POST /api/prs/:id/run-insights returns insights_started', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/run-insights`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'insights_started' });
  });

  it('POST /api/prs/:id/run-insights returns 404 for non-existent PR', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/nonexistent/run-insights',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:id/cancel-agent accepts source query param', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/cancel-agent?source=insights`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'cancelled' });
  });

  it('POST /api/prs/:id/cancel-agent works without source param', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/cancel-agent`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: 'cancelled' });
  });

  it('GET /api/prs/:prId/insights returns insights after creation', async () => {
    const categories = {
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [{ title: 'Better prompts', description: 'Use XML tags' }],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/insights`,
    });
    expect(response.statusCode).toBe(200);

    const body = response.json();
    expect(body).not.toBeNull();
    expect(body.prId).toBe(prId);
    expect(body.categories).toEqual(categories);
  });
});
