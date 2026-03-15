import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';

describe('Insights API', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const projectResponse = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = jsonBody(projectResponse).id as string;

    const prResponse = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = jsonBody(prResponse).id as string;
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
    expect(jsonBody(response)).toBeNull();
  });

  it('PUT /api/prs/:prId/insights creates insights on first call (upsert)', async () => {
    const categories = {
      claudeMdRecommendations: [
        {
          title: 'Add lint rule',
          description: 'Enable no-unused-vars',
          confidence: 'high',
        },
      ],
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

    const body = jsonBody(response);
    expect(body.prId).toBe(prId);
    expect(body.categories).toEqual(categories);
    expect(body.branchRef).toBe('feat/x');
    expect(body.worktreePath).toBe('/tmp/wt');
    expect(body.id).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('PUT /api/prs/:prId/insights updates existing insights (upsert)', async () => {
    const categories1 = {
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc A', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };
    const categories2 = {
      claudeMdRecommendations: [
        { title: 'Rule B', description: 'Desc B', confidence: 'medium' },
      ],
      skillRecommendations: [
        { title: 'Skill 1', description: 'Do this', confidence: 'low' },
      ],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const first = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories1 },
    });
    expect(first.statusCode).toBe(200);
    const firstId = jsonBody(first).id as string;

    const second = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories2, branchRef: 'feat/y' },
    });
    expect(second.statusCode).toBe(200);
    const secondBody = jsonBody(second);
    expect(secondBody.id).toBe(firstId);
    expect(secondBody.categories).toEqual(categories2);
    expect(secondBody.branchRef).toBe('feat/y');
  });

  it('GET /api/projects/:projectId/comments/history returns comments across all PRs', async () => {
    const pr2Response = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR 2', description: '', sourceBranch: 'feat/y' },
    });
    const prId2 = jsonBody(pr2Response).id as string;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'Fix in PR1',
        type: 'must-fix',
        author: 'human',
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId2}/comments`,
      payload: {
        filePath: 'src/b.ts',
        startLine: 5,
        endLine: 5,
        body: 'Fix in PR2',
        type: 'suggestion',
        author: 'human',
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);

    const comments = jsonArrayBody(response);
    expect(comments).toHaveLength(2);

    const bodies = comments.map((c) => String(c.body));
    bodies.sort((a, b) => a.localeCompare(b));
    expect(bodies).toEqual(['Fix in PR1', 'Fix in PR2']);

    const prIds = comments.map((c) => String(c.prId));
    prIds.sort((a, b) => a.localeCompare(b));
    const expectedPrIds = [prId, prId2];
    expectedPrIds.sort((a, b) => a.localeCompare(b));
    expect(prIds).toEqual(expectedPrIds);
  });

  it('GET /api/projects/:projectId/comments/history filters out question comments by default', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'Why is this here?',
        type: 'question',
        author: 'human',
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/b.ts',
        startLine: 2,
        endLine: 2,
        body: 'Consider renaming',
        type: 'suggestion',
        author: 'human',
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/c.ts',
        startLine: 3,
        endLine: 3,
        body: 'This must be fixed',
        type: 'must-fix',
        author: 'human',
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);

    const comments = jsonArrayBody(response);
    expect(comments).toHaveLength(2);

    const bodies = comments.map((c) => String(c.body));
    bodies.sort((a, b) => a.localeCompare(b));
    expect(bodies).toEqual(['Consider renaming', 'This must be fixed']);
  });

  it('GET /api/projects/:projectId/comments/history returns empty array for project with no PRs', async () => {
    const proj2Response = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'empty-project', path: '/tmp/empty' },
    });
    const emptyProjectId = jsonBody(proj2Response).id as string;

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${emptyProjectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonArrayBody(response)).toEqual([]);
  });

  it('POST /api/prs/:id/run-insights returns insights_started', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/run-insights`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)).toEqual({ status: 'insights_started' });
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
    expect(jsonBody(response)).toEqual({ status: 'cancelled' });
  });

  it('POST /api/prs/:id/cancel-agent works without source param', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/cancel-agent`,
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response)).toEqual({ status: 'cancelled' });
  });

  it('GET /api/prs/:prId/insights returns insights after creation', async () => {
    const categories = {
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [
        {
          title: 'Better prompts',
          description: 'Use XML tags',
          confidence: 'high',
        },
      ],
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

    const body = jsonBody(response);
    expect(body).not.toBeNull();
    expect(body.prId).toBe(prId);
    expect(body.categories).toEqual(categories);
  });
});
