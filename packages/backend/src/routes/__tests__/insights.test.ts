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
