import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';
import { schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { FeedbackIntegrator } from '../review/feedback-integrator.js';
import type { AgentRunner } from '../agent-runner.js';
import type { NotificationService } from '../../services/notifications.js';

function createMockAgentRunner(): AgentRunner {
  return {
    run: vi.fn().mockResolvedValue(),
    hasActiveSession: vi.fn().mockReturnValue(false),
    cancel: vi.fn().mockResolvedValue(),
  } as any;
}

function createMockNotificationService(): NotificationService {
  return {
    notifyPRReadyForReview: vi.fn(),
  } as any;
}

describe('FeedbackIntegrator', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let database: any;
  let integrator: FeedbackIntegrator;
  let mockRunner: ReturnType<typeof createMockAgentRunner>;
  let mockNotifications: ReturnType<typeof createMockNotificationService>;

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    database = (server as any).db;
    mockRunner = createMockAgentRunner();
    mockNotifications = createMockNotificationService();
    integrator = new FeedbackIntegrator({
      db: database,
      schema,
      agentRunner: mockRunner,
      notificationService: mockNotifications,
    });
  });

  afterEach(async () => {
    await server.close();
  });

  it('throws when PR is not found', async () => {
    await expect(integrator.run('nonexistent')).rejects.toThrow('PR not found');
  });

  it('throws when project is not found', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });

    // Temporarily disable FK constraints to set a nonexistent projectId
    const sqlite = (server as any).sqlite;
    sqlite.exec('PRAGMA foreign_keys = OFF');
    sqlite.exec(
      `UPDATE pull_requests SET project_id = 'nonexistent-project-id' WHERE id = '${pr.json().id}'`,
    );
    sqlite.exec('PRAGMA foreign_keys = ON');

    await expect(integrator.run(pr.json().id)).rejects.toThrow(
      'Project not found',
    );
  });

  it('builds prompt from comments and calls agentRunner.run', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-fi' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    // Add comments
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Fix this',
        severity: 'must-fix',
        author: 'human',
      },
    });

    // Add a general comment (no filePath)
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        body: 'Overall the code needs cleanup',
        severity: 'suggestion',
        author: 'human',
      },
    });

    // Request changes to set cycle status
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    expect(mockRunner.run).toHaveBeenCalledTimes(1);
    const runCall = (mockRunner.run as any).mock.calls[0];
    expect(runCall[0].prId).toBe(prId);
    expect(runCall[0].source).toBe('code-fix');
    expect(runCall[0].prompt).toContain('2 comments');
  });

  it('uses workingDirectory when set on PR', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-wd' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: {
        title: 'Worktree PR',
        description: '',
        sourceBranch: 'feat/x',
        workingDirectory: '/tmp/worktree-path',
      },
    });
    const prId = pr.json().id;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    const runCall = (mockRunner.run as any).mock.calls[0];
    expect(runCall[0].projectPath).toBe('/tmp/worktree-path');
  });

  it('handles onComplete callback', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-complete' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Make run call the onComplete callback
    (mockRunner.run as any).mockImplementation(
      async (_config: any, callbacks: any) => {
        callbacks.onComplete();
      },
    );

    await integrator.run(prId);

    // Verify notification was sent
    expect(mockNotifications.notifyPRReadyForReview).toHaveBeenCalled();

    // Verify cycle status was set to agent_completed
    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const latestCycle = cycles.reduce(
      (best: any, c: any) =>
        c.cycleNumber > (best?.cycleNumber ?? 0) ? c : best,
      null,
    );
    expect(latestCycle.status).toBe('agent_completed');
  });

  it('handles onError callback', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-error' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    // Make run call the onError callback
    (mockRunner.run as any).mockImplementation(
      async (_config: any, callbacks: any) => {
        callbacks.onError(new Error('Agent failed'));
      },
    );

    await integrator.run(prId);

    // Verify cycle status was set to agent_error
    const cycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const latestCycle = cycles.reduce(
      (best: any, c: any) =>
        c.cycleNumber > (best?.cycleNumber ?? 0) ? c : best,
      null,
    );
    expect(latestCycle.status).toBe('agent_error');
  });

  it('sets cycle to agent_error and rethrows when run throws', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-throw' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    (mockRunner.run as any).mockRejectedValue(new Error('Runner crashed'));

    await expect(integrator.run(prId)).rejects.toThrow('Runner crashed');
  });

  it('excludes resolved comments from the summary', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-resolved' },
    });
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${proj.json().id}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = pr.json().id;

    // Add a resolved comment
    const c1 = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'resolved',
        severity: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'PUT',
      url: `/api/comments/${c1.json().id}`,
      payload: { resolved: true },
    });

    // Add an unresolved comment
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/b.ts',
        startLine: 5,
        endLine: 5,
        body: 'needs work',
        severity: 'request',
        author: 'human',
      },
    });

    // Add a reply (should be excluded as it has parentCommentId)
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'reply',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: c1.json().id,
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    const runCall = (mockRunner.run as any).mock.calls[0];
    // Only 1 unresolved top-level comment
    expect(runCall[0].prompt).toContain('1 comment');
  });

  it('throws when no review cycle exists', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-cycle' },
    });
    // Insert a PR directly without a cycle
    const prId = 'direct-pr-no-cycle';
    database.insert(schema.pullRequests)
      .values({
        id: prId,
        projectId: proj.json().id,
        title: 'No Cycle PR',
        description: '',
        sourceBranch: 'feat/x',
        baseBranch: 'main',
        status: 'open',
      })
      .run();

    await expect(integrator.run(prId)).rejects.toThrow('No review cycle found');
  });
});
