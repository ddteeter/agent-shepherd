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
        type: 'must-fix',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).type).toBe('must-fix');
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
        type: 'suggestion',
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
        type: 'request',
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
        type: 'suggestion',
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
        type: 'suggestion',
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
        type: 'must-fix',
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
        type: 'suggestion',
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
        type: 'request',
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
            type: 'suggestion',
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
        type: 'must-fix',
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
        type: 'suggestion',
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

  it('GET /api/prs/:id/comments filters by type', async () => {
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/a.ts',
        startLine: 1,
        endLine: 1,
        body: 'must fix this',
        type: 'must-fix',
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
        type: 'suggestion',
        author: 'human',
      },
    });

    const filtered = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments?type=must-fix`,
    });
    const filteredData = jsonArrayBody(filtered);
    expect(filteredData).toHaveLength(1);
    expect(filteredData[0].type).toBe('must-fix');
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
        type: 'must-fix',
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
        type: 'request',
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
        type: 'suggestion',
        author: 'human',
      },
    });
    await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        body: 'Overall feedback',
        type: 'suggestion',
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
        type: 'suggestion',
        author: 'agent',
        parentCommentId: parentId,
      },
    });

    const response = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments?summary=true`,
    });
    const summary = jsonBody(response);
    const byType = summary.byType as Record<string, number>;
    const files = summary.files as Record<string, unknown>[];
    expect(summary.total).toBe(4);
    expect(byType['must-fix']).toBe(1);
    expect(byType.request).toBe(1);
    expect(byType.suggestion).toBe(2);
    expect(summary.generalCount).toBe(1);
    expect(files).toHaveLength(2);
    expect(files[0].path).toBe('src/auth.ts');
    expect(files[0].count).toBe(2);
  });

  it('POST /api/prs/:id/comments with side: old stores the side', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        side: 'old',
        body: 'This was removed',
        type: 'suggestion',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).side).toBe('old');
  });

  it('POST /api/prs/:id/comments with side: new stores the side', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        side: 'new',
        body: 'This was added',
        type: 'suggestion',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).side).toBe('new');
  });

  it('POST /api/prs/:id/comments without side defaults to null', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 10,
        endLine: 12,
        body: 'No side specified',
        type: 'suggestion',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).side).toBeNull();
  });

  it('POST /api/prs/:id/comments/batch passes side through for each comment', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [
          {
            filePath: 'src/a.ts',
            startLine: 1,
            endLine: 1,
            side: 'old',
            body: 'old side comment',
            type: 'suggestion',
          },
          {
            filePath: 'src/b.ts',
            startLine: 2,
            endLine: 2,
            side: 'new',
            body: 'new side comment',
            type: 'suggestion',
          },
        ],
        replies: [],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).created).toBe(2);

    const commentsResponse = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    const allComments = jsonArrayBody(commentsResponse);
    const oldComment = allComments.find((c) => c.body === 'old side comment');
    const newComment = allComments.find((c) => c.body === 'new side comment');
    expect(oldComment?.side).toBe('old');
    expect(newComment?.side).toBe('new');
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
            type: 'suggestion',
          },
          {
            filePath: 'src/b.ts',
            startLine: 2,
            endLine: 2,
            body: 'c2',
            type: 'request',
          },
        ],
        replies: [],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).created).toBe(2);
  });
});
