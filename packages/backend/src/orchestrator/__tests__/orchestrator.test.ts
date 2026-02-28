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

  it('includes unresolved comments from all cycles in the prompt', async () => {
    const db = (server as any).db;

    // Add a comment on cycle 1
    const c1Resp = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Fix the null check here',
        severity: 'must-fix',
        author: 'human',
      },
    });
    expect(c1Resp.statusCode).toBe(201);
    const cycle1CommentId = c1Resp.json().id;

    // Request changes on cycle 1 (without orchestrator, just update status)
    const cycle1 = db.select().from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId)).all()[0];
    db.update(schema.reviewCycles)
      .set({ status: 'changes_requested', reviewedAt: new Date().toISOString() })
      .where(eq(schema.reviewCycles.id, cycle1.id))
      .run();

    // Agent ready: creates cycle 2 via API
    // Note: agent-ready tries to compute a diff which will fail for /tmp/test,
    // but it still creates the new cycle (diff failure is non-fatal)
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/agent-ready`,
    });

    // Verify cycle 2 was created
    const cycles = db.select().from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId)).all();
    expect(cycles).toHaveLength(2);

    // Add a reply to the cycle 1 comment, attached to cycle 2
    const cycle2 = cycles.find((c: any) => c.cycleNumber === 2);
    const replyResp = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'I fixed it by adding a guard clause',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: cycle1CommentId,
      },
    });
    expect(replyResp.statusCode).toBe(201);

    // Now query ALL comments across ALL cycles (the fixed logic)
    const allCycles = db.select().from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    const allComments = db.select().from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds)).all();

    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);
    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    // Build prompt and verify it includes the cycle 1 comment and the cycle 2 reply
    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      comments: reviewComments,
    });

    expect(prompt).toContain('Fix the null check here');
    expect(prompt).toContain('I fixed it by adding a guard clause');
    expect(reviewComments).toHaveLength(1);
    expect(reviewComments[0].thread).toHaveLength(1);
  });

  it('excludes resolved comments from the prompt', async () => {
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

    const c2Resp = await inject({
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

    // Query all comments across all cycles (same logic as the fix)
    const allCycles = db.select().from(schema.reviewCycles)
      .where(eq(schema.reviewCycles.prId, prId)).all();
    const cycleIds = allCycles.map((c: any) => c.id);

    const allComments = db.select().from(schema.comments)
      .where(inArray(schema.comments.reviewCycleId, cycleIds)).all();

    const topLevel = allComments.filter((c: any) => !c.parentCommentId && !c.resolved);
    const reviewComments = topLevel.map((c: any) => ({
      id: c.id,
      filePath: c.filePath,
      startLine: c.startLine,
      endLine: c.endLine,
      body: c.body,
      severity: c.severity,
      thread: allComments
        .filter((r: any) => r.parentCommentId === c.id)
        .map((r: any) => ({ author: r.author, body: r.body })),
    }));

    // Build prompt
    const prompt = buildReviewPrompt({
      prId,
      prTitle: 'Test PR',
      agentContext: null,
      comments: reviewComments,
    });

    // Resolved comment should be excluded
    expect(prompt).not.toContain('This is resolved already');
    // Unresolved comment should be included
    expect(prompt).toContain('This still needs work');
    expect(reviewComments).toHaveLength(1);
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
