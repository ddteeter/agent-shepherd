import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';
import { schema } from '../../db/index.js';
import { eq } from 'drizzle-orm';
import { FeedbackIntegrator } from '../review/feedback-integrator.js';
import type { AgentRunner } from '../agent-runner.js';
import type { AgentRunConfig, AgentRunCallbacks } from '../types.js';
import type { NotificationService } from '../../services/notifications.js';

function createMockAgentRunner() {
  const runMock = vi
    .fn<
      (config: AgentRunConfig, callbacks: AgentRunCallbacks) => Promise<void>
    >()
    .mockImplementation(() => Promise.resolve());
  const cancelMock = vi
    .fn<() => Promise<void>>()
    .mockImplementation(() => Promise.resolve());
  const hasActiveSessionMock = vi.fn().mockReturnValue(false);
  const runner = {
    run: runMock,
    hasActiveSession: hasActiveSessionMock,
    cancel: cancelMock,
  } as unknown as AgentRunner;
  return { runner, runMock, cancelMock, hasActiveSessionMock };
}

function createMockNotificationService() {
  const notifyMock = vi.fn();
  const service = {
    notifyPRReadyForReview: notifyMock,
  } as unknown as NotificationService;
  return { service, notifyMock };
}

describe('FeedbackIntegrator', () => {
  let server: FastifyInstance;
  let inject: Awaited<ReturnType<typeof createTestServer>>['inject'];
  let integrator: FeedbackIntegrator;
  let runMock: ReturnType<typeof createMockAgentRunner>['runMock'];
  let notifyMock: ReturnType<
    typeof createMockNotificationService
  >['notifyMock'];

  beforeEach(async () => {
    ({ server, inject } = await createTestServer());
    const mockRunnerResult = createMockAgentRunner();
    const mockNotificationsResult = createMockNotificationService();
    runMock = mockRunnerResult.runMock;
    notifyMock = mockNotificationsResult.notifyMock;
    integrator = new FeedbackIntegrator({
      db: server.db,
      schema,
      agentRunner: mockRunnerResult.runner,
      notificationService: mockNotificationsResult.service,
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
    const projBody = proj.json<Record<string, unknown>>();
    const projId = String(projBody.id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prBody = pr.json<Record<string, unknown>>();
    const prId = String(prBody.id);

    const sqlite = server.sqlite;
    sqlite.exec('PRAGMA foreign_keys = OFF');
    sqlite.exec(
      `UPDATE pull_requests SET project_id = 'nonexistent-project-id' WHERE id = '${prId}'`,
    );
    sqlite.exec('PRAGMA foreign_keys = ON');

    await expect(integrator.run(prId)).rejects.toThrow('Project not found');
  });

  it('builds prompt from comments and calls agentRunner.run', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-fi' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

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

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        body: 'Overall the code needs cleanup',
        severity: 'suggestion',
        author: 'human',
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    expect(runMock).toHaveBeenCalledTimes(1);
    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.prId).toBe(prId);
    expect(runConfig.source).toBe('code-fix');
    expect(runConfig.prompt).toContain('2 comments');
  });

  it('uses workingDirectory when set on PR', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-wd' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: {
        title: 'Worktree PR',
        description: '',
        sourceBranch: 'feat/x',
        workingDirectory: '/tmp/worktree-path',
      },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.projectPath).toBe('/tmp/worktree-path');
  });

  it('handles onComplete callback', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-complete' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    runMock.mockImplementation(
      (_config: AgentRunConfig, callbacks: AgentRunCallbacks) => {
        callbacks.onComplete();
        return Promise.resolve();
      },
    );

    await integrator.run(prId);

    expect(notifyMock).toHaveBeenCalled();

    const cycles = server.db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    let latestCycle: (typeof cycles)[0] | undefined;
    for (const c of cycles) {
      if (!latestCycle || c.cycleNumber > latestCycle.cycleNumber) {
        latestCycle = c;
      }
    }
    expect(latestCycle?.status).toBe('agent_completed');
  });

  it('handles onError callback', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-error' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    runMock.mockImplementation(
      (_config: AgentRunConfig, callbacks: AgentRunCallbacks) => {
        callbacks.onError(new Error('Agent failed'));
        return Promise.resolve();
      },
    );

    await integrator.run(prId);

    const cycles = server.db
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    let latestCycle: (typeof cycles)[0] | undefined;
    for (const c of cycles) {
      if (!latestCycle || c.cycleNumber > latestCycle.cycleNumber) {
        latestCycle = c;
      }
    }
    expect(latestCycle?.status).toBe('agent_error');
  });

  it('sets cycle to agent_error and rethrows when run throws', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-throw' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    runMock.mockRejectedValue(new Error('Runner crashed'));

    await expect(integrator.run(prId)).rejects.toThrow('Runner crashed');
  });

  it('excludes resolved comments from the summary', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-resolved' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projId}/prs`,
      payload: { title: 'PR', description: '', sourceBranch: 'feat/x' },
    });
    const prId = String(pr.json<Record<string, unknown>>().id);

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
    const c1Id = String(c1.json<Record<string, unknown>>().id);
    await inject({
      method: 'PUT',
      url: `/api/comments/${c1Id}`,
      payload: { resolved: true },
    });

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
        parentCommentId: c1Id,
      },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/review`,
      payload: { action: 'request-changes' },
    });

    await integrator.run(prId);

    const runConfig = runMock.mock.calls[0][0];
    expect(runConfig.prompt).toContain('1 comment');
  });

  it('throws when no review cycle exists', async () => {
    const proj = await inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test-no-cycle' },
    });
    const projId = String(proj.json<Record<string, unknown>>().id);
    const prId = 'direct-pr-no-cycle';
    server.db
      .insert(schema.pullRequests)
      .values({
        id: prId,
        projectId: projId,
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
