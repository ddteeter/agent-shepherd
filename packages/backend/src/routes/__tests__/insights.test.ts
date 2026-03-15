import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer, jsonBody } from '../../__tests__/helpers.js';

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
      toolRecommendations: [],
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
    expect(body.categories).toMatchObject(categories);
    expect(body.branchRef).toBe('feat/x');
    expect(body.worktreePath).toBe('/tmp/wt');
    expect(body.id).toBeDefined();
    expect(body.updatedAt).toBeDefined();
  });

  it('PUT /api/prs/:prId/insights updates existing insights (upsert)', async () => {
    const categories1 = {
      toolRecommendations: [],
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc A', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };
    const categories2 = {
      toolRecommendations: [],
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
    expect(secondBody.categories).toMatchObject(categories2);
    expect(secondBody.branchRef).toBe('feat/y');
  });

  it('GET /api/projects/:projectId/comments/history with currentPrId groups comments', async () => {
    const pr2Response = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'PR 2', description: 'second', sourceBranch: 'feat/y' },
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
      url: `/api/projects/${projectId}/comments/history?currentPrId=${prId}`,
    });
    expect(response.statusCode).toBe(200);

    const body = jsonBody(response);
    expect(body.currentPr).toBeDefined();
    expect((body.currentPr as Record<string, unknown>).prId).toBe(prId);
    expect((body.currentPr as Record<string, unknown>).prTitle).toBe('PR');

    const currentComments = (body.currentPr as Record<string, unknown>)
      .comments as Record<string, unknown>[];
    expect(currentComments).toHaveLength(1);
    expect(currentComments[0].body).toBe('Fix in PR1');

    const otherPrs = body.otherPrs as Record<string, unknown>[];
    expect(otherPrs).toHaveLength(1);
    expect(otherPrs[0].prId).toBe(prId2);
    expect(otherPrs[0].prTitle).toBe('PR 2');

    const otherComments = otherPrs[0].comments as Record<string, unknown>[];
    expect(otherComments).toHaveLength(1);
    expect(otherComments[0].body).toBe('Fix in PR2');
  });

  it('GET /api/projects/:projectId/comments/history without currentPrId puts all in otherPrs', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'A comment',
        type: 'must-fix',
        author: 'human',
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);

    const body = jsonBody(response);
    expect(body.currentPr).toBeUndefined();

    const otherPrs = body.otherPrs as Record<string, unknown>[];
    expect(otherPrs).toHaveLength(1);
    expect(otherPrs[0].prId).toBe(prId);

    const comments = otherPrs[0].comments as Record<string, unknown>[];
    expect(comments).toHaveLength(1);
    expect(comments[0].body).toBe('A comment');
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

    const body = jsonBody(response);
    const comments = body.otherPrs as { comments: Record<string, unknown>[] }[];
    const allComments = comments.flatMap((pr) => pr.comments);
    expect(allComments).toHaveLength(2);

    const bodies = allComments.map((c) => String(c.body));
    bodies.sort((a, b) => a.localeCompare(b));
    expect(bodies).toEqual(['Consider renaming', 'This must be fixed']);
  });

  it('GET /api/projects/:projectId/comments/history respects insightsIgnoredTypes config override', async () => {
    await inject({
      method: 'PUT',
      url: `/api/projects/${projectId}/config`,
      payload: { key: 'insightsIgnoredTypes', value: '[]' },
    });

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
        body: 'Must fix this',
        type: 'must-fix',
        author: 'human',
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/projects/${projectId}/comments/history`,
    });
    expect(response.statusCode).toBe(200);

    const body = jsonBody(response);
    const comments = body.otherPrs as { comments: Record<string, unknown>[] }[];
    const allComments = comments.flatMap((pr) => pr.comments);
    expect(allComments).toHaveLength(2);

    const types = allComments.map((c) => String(c.type));
    types.sort((a, b) => a.localeCompare(b));
    expect(types).toEqual(['must-fix', 'question']);
  });

  it('GET /api/projects/:projectId/comments/history returns grouped structure for empty project', async () => {
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

    const body = jsonBody(response);
    expect(body.currentPr).toBeUndefined();
    expect(body.otherPrs).toEqual([]);
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
      toolRecommendations: [],
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
    expect(body.categories).toMatchObject(categories);
  });

  it('PUT stamps firstSeenAt on items during first create', async () => {
    const categories = {
      toolRecommendations: [],
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const response = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    const body = jsonBody(response);
    const items = (body.categories as Record<string, Record<string, unknown>[]>)
      .claudeMdRecommendations;
    expect(items[0].firstSeenAt).toBeDefined();
    expect(items[0].lastUpdatedAt).toBeUndefined();
    expect(body.previousUpdatedAt).toBeNull();
  });

  it('PUT rotates previousUpdatedAt on second call', async () => {
    const categories = {
      toolRecommendations: [],
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const first = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    const firstUpdatedAt = jsonBody(first).updatedAt as string;

    const second = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    const secondBody = jsonBody(second);
    expect(secondBody.previousUpdatedAt).toBe(firstUpdatedAt);
  });

  it('PUT preserves firstSeenAt for unchanged items across updates', async () => {
    const categories = {
      toolRecommendations: [],
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    const first = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    const firstItems = (
      jsonBody(first).categories as Record<string, Record<string, unknown>[]>
    ).claudeMdRecommendations;
    const originalFirstSeenAt = firstItems[0].firstSeenAt;

    const second = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    const secondItems = (
      jsonBody(second).categories as Record<string, Record<string, unknown>[]>
    ).claudeMdRecommendations;
    expect(secondItems[0].firstSeenAt).toBe(originalFirstSeenAt);
  });

  it('PUT sets lastUpdatedAt when item content changes', async () => {
    const categories1 = {
      toolRecommendations: [],
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Desc', confidence: 'high' },
      ],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories1 },
    });

    const categories2 = {
      ...categories1,
      claudeMdRecommendations: [
        { title: 'Rule A', description: 'Changed desc', confidence: 'medium' },
      ],
    };

    const second = await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories: categories2 },
    });
    const items = (
      jsonBody(second).categories as Record<string, Record<string, unknown>[]>
    ).claudeMdRecommendations;
    expect(items[0].lastUpdatedAt).toBeDefined();
  });

  it('GET returns previousUpdatedAt from the record', async () => {
    const categories = {
      toolRecommendations: [],
      claudeMdRecommendations: [],
      skillRecommendations: [],
      promptEngineering: [],
      agentBehaviorObservations: [],
      recurringPatterns: [],
    };

    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });
    await inject({
      method: 'PUT',
      url: `/api/prs/${prId}/insights`,
      payload: { categories },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/insights`,
    });
    const body = jsonBody(response);
    expect(body.previousUpdatedAt).toBeDefined();
    expect(body.previousUpdatedAt).not.toBeNull();
  });
});
