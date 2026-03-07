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
    projectId = proj.json().id;

    const pr = await inject({
      method: 'POST',
      url: `/api/projects/${projectId}/prs`,
      payload: { title: 'Test PR', description: '', sourceBranch: 'feat/x' },
    });
    prId = pr.json().id;
  });

  afterEach(async () => {
    await server.close();
  });

  it('includes comment summary in the prompt', async () => {
    const db = (server as any).db;

    // Add comments on cycle 1
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/index.ts', startLine: 10, endLine: 10, body: 'Fix the null check', severity: 'must-fix', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/auth.ts', startLine: 5, endLine: 5, body: 'Add validation', severity: 'request', author: 'human' },
    });

    // Build summary the way the orchestrator would
    const allCycles = db.select().from(schema.reviewCycles).where(eq(schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);
    const allComments = db.select().from(schema.comments).where(inArray(schema.comments.reviewCycleId, cycleIds)).all();
    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
    let generalCount = 0;
    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      if (!c.filePath) {
        generalCount++;
      } else {
        const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
        fileMap.set(c.filePath, entry);
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
        generalCount,
      },
    });

    expect(prompt).toContain('2 comments');
    expect(prompt).toContain('src/index.ts');
    expect(prompt).toContain('src/auth.ts');
    expect(prompt).toContain('agent-shepherd review');
    // Should NOT contain the actual comment body text
    expect(prompt).not.toContain('Fix the null check');
  });

  it('excludes resolved comments from the summary', async () => {
    const db = (server as any).db;

    // Add two comments
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
    const resolvedCommentId = c1Resp.json().id;

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

    // Resolve the first comment
    await inject({
      method: 'PUT',
      url: `/api/comments/${resolvedCommentId}`,
      payload: { resolved: true },
    });

    // Build summary (same logic as orchestrator)
    const allCycles = db.select().from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    const allComments = db.select().from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds)).all();

    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);

    const bySeverity: Record<string, number> = {};
    const fileMap = new Map<string, { count: number; bySeverity: Record<string, number> }>();
    let generalCount = 0;
    for (const c of topLevel) {
      bySeverity[c.severity] = (bySeverity[c.severity] || 0) + 1;
      if (!c.filePath) {
        generalCount++;
      } else {
        const entry = fileMap.get(c.filePath) || { count: 0, bySeverity: {} };
        entry.count++;
        entry.bySeverity[c.severity] = (entry.bySeverity[c.severity] || 0) + 1;
        fileMap.set(c.filePath, entry);
      }
    }

    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      commentSummary: {
        total: topLevel.length,
        bySeverity,
        files: [...fileMap.entries()].map(([path, data]) => ({ path, ...data })),
        generalCount,
      },
    });

    // Summary should show 1 comment (the resolved one is excluded)
    expect(prompt).toContain('1 comment');
    expect(prompt).toContain('1 must-fix');
    // Should NOT contain the actual comment body text
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
    const pr = createResp.json();
    expect(pr.workingDirectory).toBe('/repo/.claude/worktrees/task-1');

    // Verify that both project.path and pr.workingDirectory are available
    const db = (server as any).db;
    const project = db.select().from(schema.projects)
      .where(eq(schema.projects.id, pr.projectId)).get();
    expect(project.path).toBe('/tmp/test');

    // Orchestrator should prefer pr.workingDirectory over project.path
    const effectivePath = pr.workingDirectory ?? project.path;
    expect(effectivePath).toBe('/repo/.claude/worktrees/task-1');
  });
});
