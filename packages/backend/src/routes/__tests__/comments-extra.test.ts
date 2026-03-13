import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import {
  createTestServer,
  jsonBody,
  jsonArrayBody,
} from '../../__tests__/helpers.js';

describe('Comments API - additional coverage', () => {
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

  it('PUT /api/comments/:id returns 404 for missing comment', async () => {
    const response = await inject({
      method: 'PUT',
      url: '/api/comments/nonexistent',
      payload: { resolved: true },
    });
    expect(response.statusCode).toBe(404);
  });

  it('DELETE /api/comments/:id deletes a comment', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'delete me',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const commentId = jsonBody(create).id as string;

    const deleteResponse = await inject({
      method: 'DELETE',
      url: `/api/comments/${commentId}`,
    });
    expect(deleteResponse.statusCode).toBe(204);

    const list = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(jsonArrayBody(list)).toHaveLength(0);
  });

  it('DELETE /api/comments/:id returns 404 for missing comment', async () => {
    const response = await inject({
      method: 'DELETE',
      url: '/api/comments/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:prId/comments returns 404 when no review cycle exists', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/no-such-pr/comments',
      payload: {
        body: 'test',
        severity: 'suggestion',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:prId/comments/batch returns 404 when no review cycle exists', async () => {
    const response = await inject({
      method: 'POST',
      url: '/api/prs/no-such-pr/comments/batch',
      payload: { comments: [], replies: [] },
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:prId/comments/batch handles batch with replies to nonexistent parent', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments/batch`,
      payload: {
        comments: [],
        replies: [
          {
            parentCommentId: 'nonexistent',
            body: 'reply to nothing',
            severity: 'suggestion',
          },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(jsonBody(response).created).toBe(0);
  });

  it('GET /api/prs/:prId/comments?summary=true returns summary for PR with no cycles', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/comments?summary=true',
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).total).toBe(0);
  });

  it('GET /api/prs/:prId/comments returns empty array for PR with no cycles', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/comments',
    });
    expect(response.statusCode).toBe(200);
    expect(jsonArrayBody(response)).toEqual([]);
  });

  it('PUT /api/comments/:id updates comment body', async () => {
    const create = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        filePath: 'src/index.ts',
        startLine: 1,
        endLine: 1,
        body: 'original',
        severity: 'suggestion',
        author: 'human',
      },
    });
    const commentId = jsonBody(create).id as string;

    const response = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { body: 'updated body' },
    });
    expect(response.statusCode).toBe(200);
    expect(jsonBody(response).body).toBe('updated body');
  });

  it('POST comment without optional fields defaults correctly', async () => {
    const response = await inject({
      method: 'POST',
      url: `/api/prs/${prId}/comments`,
      payload: {
        body: 'general comment',
        author: 'human',
      },
    });
    expect(response.statusCode).toBe(201);
    const comment = jsonBody(response);
    expect(comment.filePath).toBeNull();
    expect(comment.startLine).toBeNull();
    expect(comment.endLine).toBeNull();
    expect(comment.severity).toBe('suggestion');
    expect(comment.parentCommentId).toBeNull();
  });
});
