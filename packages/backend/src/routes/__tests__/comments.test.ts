import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Comments API', () => {
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

  it('POST /api/prs/:id/comments adds a comment', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        body: 'This needs work',
        severity: 'must-fix',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().severity).toBe('must-fix');
  });

  it('GET /api/prs/:id/comments lists comments', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'comment 1',
        severity: 'suggestion',
        author: 'human',
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('supports threaded replies via parentCommentId', async () => {
    const parent = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Fix this',
        severity: 'request',
        author: 'human',
      },
    });
    const parentId = parent.json().id;

    const reply = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Done',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: parentId,
      },
    });
    expect(reply.statusCode).toBe(201);
    expect(reply.json().parentCommentId).toBe(parentId);
  });

  it('PUT /api/comments/:id resolves a comment', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'test',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const commentId = create.json().id;

    const response = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().resolved).toBe(true);
  });

  it('should unresolve parent comment when reply is added', async () => {
    // Create a top-level comment
    const create = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Fix this',
        severity: 'must-fix',
        author: 'human',
      },
    });
    const parentId = create.json().id;

    // Resolve the comment
    await inject({
      method: 'PUT',
      url: `/api/comments/${parentId}`,
      payload: { resolved: true },
    });

    // Add a reply to the resolved comment
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 5,
        endLine: 5,
        body: 'Actually, this still needs work',
        severity: 'suggestion',
        author: 'human',
        parentCommentId: parentId,
      },
    });

    // Verify parent is now unresolved
    const comments = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const parentComment = comments.json().find((c: any) => c.id === parentId);
    expect(parentComment.resolved).toBeFalsy();
  });

  it('should unresolve parent comment when batch reply is added', async () => {
    // Create a top-level comment
    const create = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 10,
        body: 'Needs refactoring',
        severity: 'request',
        author: 'human',
      },
    });
    const parentId = create.json().id;

    // Resolve the comment
    await inject({
      method: 'PUT',
      url: `/api/comments/${parentId}`,
      payload: { resolved: true },
    });

    // Batch create a reply
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [],
        replies: [
          { parentCommentId: parentId, body: 'Done with changes', severity: 'suggestion' },
        ],
      },
    });

    // Verify parent is now unresolved
    const comments = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const parentComment = comments.json().find((c: any) => c.id === parentId);
    expect(parentComment.resolved).toBeFalsy();
  });

  it('GET /api/prs/:id/comments filters by filePath', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'fix auth', severity: 'must-fix', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/db.ts', startLine: 5, endLine: 5, body: 'fix db', severity: 'suggestion', author: 'human' },
    });

    const filtered = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?filePath=src/auth.ts` });
    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0].body).toBe('fix auth');
  });

  it('GET /api/prs/:id/comments filters by severity', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'must fix this', severity: 'must-fix', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/b.ts', startLine: 1, endLine: 1, body: 'suggestion', severity: 'suggestion', author: 'human' },
    });

    const filtered = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?severity=must-fix` });
    expect(filtered.json()).toHaveLength(1);
    expect(filtered.json()[0].severity).toBe('must-fix');
  });

  it('GET /api/prs/:id/comments?summary=true returns comment stats', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'fix1', severity: 'must-fix', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/auth.ts', startLine: 10, endLine: 10, body: 'fix2', severity: 'request', author: 'human' },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/db.ts', startLine: 5, endLine: 5, body: 'suggestion1', severity: 'suggestion', author: 'human' },
    });
    // Add a general (no-file) comment
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { body: 'Overall feedback', severity: 'suggestion', author: 'human' },
    });
    // Add a reply (should not count as top-level)
    const parentId = (await inject({ method: 'GET', url: `/api/prs/${prId}/comments` })).json()[0].id;
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: { filePath: 'src/auth.ts', startLine: 1, endLine: 1, body: 'reply', severity: 'suggestion', author: 'agent', parentCommentId: parentId },
    });

    const response = await inject({ method: 'GET', url: `/api/prs/${prId}/comments?summary=true` });
    const summary = response.json();
    expect(summary.total).toBe(4); // 4 top-level, reply excluded
    expect(summary.bySeverity['must-fix']).toBe(1);
    expect(summary.bySeverity.request).toBe(1);
    expect(summary.bySeverity.suggestion).toBe(2);
    expect(summary.generalCount).toBe(1);
    expect(summary.files).toHaveLength(2);
    expect(summary.files[0].path).toBe('src/auth.ts');
    expect(summary.files[0].count).toBe(2);
  });

  it('POST /api/prs/:id/comments/batch handles batch comments', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          { filePath: 'src/a.ts', startLine: 1, endLine: 1, body: 'c1', severity: 'suggestion' },
          { filePath: 'src/b.ts', startLine: 2, endLine: 2, body: 'c2', severity: 'request' },
        ],
        replies: [],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().created).toBe(2);
  });
});
