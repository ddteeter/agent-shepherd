import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildServer } from '../../server.js';
import type { FastifyInstance } from 'fastify';

describe('Comments API', () => {
  let server: FastifyInstance;
  let projectId: string;
  let prId: string;

  beforeEach(async () => {
    server = await buildServer({ dbPath: ':memory:' });
    const proj = await server.inject({
      method: 'POST',
      url: '/api/projects',
      payload: { name: 'test', path: '/tmp/test' },
    });
    projectId = proj.json().id;

    const pr = await server.inject({
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
    const response = await server.inject({
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
    await server.inject({
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

    const response = await server.inject({
      method: 'GET',
      url: `/api/prs/${prId}/comments`,
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(1);
  });

  it('supports threaded replies via parentCommentId', async () => {
    const parent = await server.inject({
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

    const reply = await server.inject({
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
    const create = await server.inject({
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

    const response = await server.inject({
      method: 'PUT',
      url: `/api/comments/${commentId}`,
      payload: { resolved: true },
    });
    expect(response.statusCode).toBe(200);
    expect(response.json().resolved).toBe(true);
  });

  it('POST /api/prs/:id/comments/batch handles batch comments', async () => {
    const response = await server.inject({
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
