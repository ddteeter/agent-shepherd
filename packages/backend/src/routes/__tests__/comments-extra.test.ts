import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { createTestServer } from '../../__tests__/helpers.js';

describe('Comments API - additional coverage', () => {
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
    const commentId = create.json().id;

    const del = await inject({
      method: 'DELETE',
      url: `/api/comments/${commentId}`,
    });
    expect(del.statusCode).toBe(204);

    // Verify it's gone
    const list = await inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(list.json()).toHaveLength(0);
  });

  it('DELETE /api/comments/:id returns 404 for missing comment', async () => {
    const response = await inject({
      method: 'DELETE',
      url: '/api/comments/nonexistent',
    });
    expect(response.statusCode).toBe(404);
  });

  it('POST /api/prs/:prId/comments returns 404 when no review cycle exists', async () => {
    // Use a nonexistent PR ID
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
          { parentCommentId: 'nonexistent', body: 'reply to nothing', severity: 'suggestion' },
        ],
      },
    });
    expect(response.statusCode).toBe(201);
    expect(response.json().created).toBe(0);
  });

  it('GET /api/prs/:prId/comments?summary=true returns summary for PR with no cycles', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/comments?summary=true',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().total).toBe(0);
  });

  it('GET /api/prs/:prId/comments returns empty array for PR with no cycles', async () => {
    const response = await inject({
      method: 'GET',
      url: '/api/prs/nonexistent/comments',
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual([]);
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
    const commentId = create.json().id;

    const response = await inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { body: 'updated body' },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().body).toBe('updated body');
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
    const comment = response.json();
    expect(comment.filePath).toBeNull();
    expect(comment.startLine).toBeNull();
    expect(comment.endLine).toBeNull();
    expect(comment.severity).toBe('suggestion');
    expect(comment.parentCommentId).toBeNull();
  });
});
