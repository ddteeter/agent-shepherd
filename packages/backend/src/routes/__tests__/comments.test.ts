import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';

describe('Comments API', () => {
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
    expect(jsonBody(response).severity).toBe('must-fix');
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
    expect(jsonArrayBody(response)).toHaveLength(1);
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
    const parentId = jsonBody(parent).id as string;

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
    expect(jsonBody(reply).parentCommentId).toBe(parentId);
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
    const commentId = jsonBody(create).id as string;

    const response = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).resolved).toBe(true);
  });

  it('should unresolve parent comment when reply is added', async () => {
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
    const parentId = jsonBody(create).id as string;

    await inject({
      method: 'PUT',
      url: `/api/comments/${parentId}`,
      payload: { resolved: true },
    });

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

    const comments = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const parentComment = jsonArrayBody(comments).find(
      (c) => c.id === parentId,
    );
    expect(parentComment?.resolved).toBeFalsy();
  });

  it('should unresolve parent comment when batch reply is added', async () => {
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
    const parentId = jsonBody(create).id as string;

    await inject({
      method: 'PUT',
      url: `/api/comments/${parentId}`,
      payload: { resolved: true },
    });

    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [],
        replies: [
          {
            parentCommentId: parentId,
            body: 'Done with changes',
            severity: 'suggestion',
          },
        ],
      },
    });

    const comments = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const parentComment = jsonArrayBody(comments).find(
      (c) => c.id === parentId,
    );
    expect(parentComment?.resolved).toBeFalsy();
  });

  it('GET /api/prs/:id/comments filters by filePath', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/auth.ts',
        startLine: 1,
        endLine: 1,
        body: 'fix auth',
        severity: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/db.ts',
        startLine: 5,
        endLine: 5,
        body: 'fix db',
        severity: 'suggestion',
        author: 'human',
      },
    });

    const filtered = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments?filePath=src/auth.ts`,
    });
    const filteredData = jsonArrayBody(filtered);
    expect(filteredData).toHaveLength(1);
    expect(filteredData[0].body).toBe('fix auth');
  });

  it('GET /api/prs/:id/comments filters by severity', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'must fix this',
        severity: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/b.ts',
        startLine: 1,
        endLine: 1,
        body: 'suggestion',
        severity: 'suggestion',
        author: 'human',
      },
    });

    const filtered = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments?severity=must-fix`,
    });
    const filteredData = jsonArrayBody(filtered);
    expect(filteredData).toHaveLength(1);
    expect(filteredData[0].severity).toBe('must-fix');
  });

  it('GET /api/prs/:id/comments?summary=true returns comment stats', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/auth.ts',
        startLine: 1,
        endLine: 1,
        body: 'fix1',
        severity: 'must-fix',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/auth.ts',
        startLine: 10,
        endLine: 10,
        body: 'fix2',
        severity: 'request',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/db.ts',
        startLine: 5,
        endLine: 5,
        body: 'suggestion1',
        severity: 'suggestion',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        body: 'Overall feedback',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const parentId = jsonArrayBody(
      await inject({ method: 'GET', url: `/api/prs/${prId}/comments` }),
    )[0].id as string;
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/auth.ts',
        startLine: 1,
        endLine: 1,
        body: 'reply',
        severity: 'suggestion',
        author: 'agent',
        parentCommentId: parentId,
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments?summary=true`,
    });
    const summary = jsonBody(response);
    const bySeverity = summary.bySeverity as Record<string, number>;
    const files = summary.files as Record<string, unknown>[];
    expect(summary.total).toBe(4);
    expect(bySeverity['must-fix']).toBe(1);
    expect(bySeverity.request).toBe(1);
    expect(bySeverity.suggestion).toBe(2);
    expect(summary.generalCount).toBe(1);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/auth.ts');
    expect(files[0].count).toBe(2);
  });

  it('POST /api/prs/:id/comments/batch handles batch comments', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          {
            filePath: 'src/a.ts',
            startLine: 1,
            endLine: 1,
            body: 'c1',
            severity: 'suggestion',
          },
          {
            filePath: 'src/b.ts',
            startLine: 2,
            endLine: 2,
            body: 'c2',
            severity: 'request',
          },
        ],
        replies: [],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).created).toBe(2);
  });
});
