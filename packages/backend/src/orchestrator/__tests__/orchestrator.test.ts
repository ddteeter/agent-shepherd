import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildReviewPrompt } from '../index.js';
import { schema } from '../../db/index.js';
import { eq, inArray } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Orchestrator cross-cycle comment query', () => {
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
    projectId = String(proj.json<Record<string, unknown>>().id);

    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = String(pr.json<Record<string, unknown>>().id);
  });

  afterEach(async () => {
    await server.close();
  });

  it('includes comment summary in the prompt', async () => {
    const database = server.db;

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Fix the null check',
        severity: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/auth.ts',
        startLine: 5,
        endLine: 5,
        body: 'Add validation',
        severity: 'request',
        author: 'human',
      },
    });

    const allCycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const cycleIds = allCycles.map((c) => c.id);
    const allComments = database
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();
    const topLevel = allComments.filter(
      (c) => !c.parentCommentId && !c.resolved,
    );

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<
      string,
      { count: number; bySeverity: Record<string, number> }
    >();
    let generalCount = 0;
    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
      if (c.filePath) {
        const entry = fileMap.get(c.filePath) ?? { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] ?? 0) + 1;
        fileMap.set(c.filePath, entry);
      } else {
        generalCount++;
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: undefined,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([filePath, data]) => ({
          path: filePath,
          ...data,
        })),
        generalCount,
      },
    });

    expect(prompt).toContain('2 comments');
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('agent-shepherd review');
    expect(prompt).not.toContain('Fix the null check');
  });

  it('excludes resolved comments from the summary', async () => {
    const database = server.db;

    const c1Resp = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'This is resolved already',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const resolvedCommentId = String(c1Resp.json<Record<string, unknown>>().id);

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 20,
        endLine: 20,
        body: 'This still needs work',
        severity: 'must-fix',
        author: 'human',
      },
    });

    await inject({
      method: 'PUT',
      url: `/api/comments/${resolvedCommentId}`,
      payload: { resolved: true },
    });

    const allCycles = database
      .select()
      .from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId))
      .all();
    const cycleIds = allCycles.map((c) => c.id);

    const allComments = database
      .select()
      .from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds))
      .all();

    const topLevel = allComments.filter(
      (c) => !c.parentCommentId && !c.resolved,
    );

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<
      string,
      { count: number; bySeverity: Record<string, number> }
    >();
    let generalCount = 0;
    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] ?? 0) + 1;
      if (c.filePath) {
        const entry = fileMap.get(c.filePath) ?? { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] ?? 0) + 1;
        fileMap.set(c.filePath, entry);
      } else {
        generalCount++;
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: undefined,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([filePath, data]) => ({
          path: filePath,
          ...data,
        })),
        generalCount,
      },
    });

    expect(prompt).toContain('1 comment');
    expect(prompt).toContain('1 must-fix');
    expect(prompt).not.toContain('This is resolved already');
    expect(prompt).not.toContain('This still needs work');
    expect(topLevel).toHaveLength(1);
  });

  it('PR stores workingDirectory for orchestrator use', async () => {
    const createResp = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: {
        title: 'Worktree PR',
        description: '',
        sourceBranch: 'feat/worktree',
        workingDirectory: '/repo/.claude/worktrees/task-1',
      },
    });
    const prData = createResp.json<Record<string, unknown>>();
    expect(prData.workingDirectory).toBe('/repo/.claude/worktrees/task-1');

    const database = server.db;
    const project = database
      .select()
      .from(schema.projects)
      .where(eq(schema.projects.id, prData.projectId as string))
      .get();
    expect(project?.path).toBe('/tmp/test');

    const effectivePath =
      (prData.workingDirectory as string | undefined) ?? project?.path;
    expect(effectivePath).toBe('/repo/.claude/worktrees/task-1');
  });
});
